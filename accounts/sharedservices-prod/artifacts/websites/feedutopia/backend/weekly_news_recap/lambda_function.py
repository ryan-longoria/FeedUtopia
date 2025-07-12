import datetime, io, json, logging, os, tempfile
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image, ImageColor, ImageDraw, ImageFont

try:
    from moviepy.video.io.VideoFileClip import VideoFileClip
except ImportError:
    VideoFileClip = None

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s", level=logging.INFO)

WIDTH, HEIGHT = 1080, 1350
TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX, DESC_MIN = 60, 30
HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR = "white"
GRADIENT_KEY = "artifacts/Black Gradient.png"
ROOT = os.path.dirname(__file__)
FONT_PATH_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")

TARGET_BUCKET   = os.environ["TARGET_BUCKET"]
NEWS_TABLE      = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

def measure(word: str, font: ImageFont.FreeTypeFont) -> int:
    return font.getbbox(word)[2]

def autosize(text: str, max_size: int, min_size: int, ideal: int) -> int:
    size = max_size if len(text) <= ideal else max_size - (len(text) - ideal)*(max_size-min_size)/ideal
    return max(int(size), min_size)

def multiline_colored(text: str, highlights: Set[str],
                      font_path: str, font_size: int,
                      max_width: int, space: int = 15) -> Image.Image:
    font = ImageFont.truetype(font_path, font_size)
    words = text.split()
    lines, cur_line, cur_w = [], [], 0

    for w in words:
        bbox = font.getbbox(w)
        w_w, w_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        advance = w_w if not cur_line else w_w + space
        if cur_w + advance <= max_width:
            cur_line.append((w, bbox))
            cur_w += advance
        else:
            lines.append(cur_line)
            cur_line, cur_w = [(w, bbox)], w_w
    if cur_line:
        lines.append(cur_line)

    rendered = []
    for line in lines:
        x_offset, line_h = 0, 0
        pieces = []
        for w, bbox in line:
            x0, y0, x1, y1 = bbox
            w_w, w_h = x1 - x0, y1 - y0
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            img = Image.new("RGBA", (w_w, w_h), (0,0,0,0))
            ImageDraw.Draw(img).text((-x0, -y0), w, font=font, fill=color)
            pieces.append((img, x_offset))
            x_offset += w_w + space
            line_h = max(line_h, w_h)
        line_img = Image.new("RGBA", (x_offset - space, line_h), (0,0,0,0))
        for img, xo in pieces:
            line_img.paste(img, (xo, 0), img)
        rendered.append(line_img)

    total_h = sum(img.height for img in rendered) + 10 * (len(rendered)-1)
    canvas = Image.new("RGBA", (max_width, total_h), (0,0,0,0))
    y = 0
    for img in rendered:
        canvas.paste(img, ((max_width - img.width)//2, y), img)
        y += img.height + 10

    return canvas

def download_to_tmp(key: str) -> str|None:
    local = os.path.join(tempfile.gettempdir(), os.path.basename(key))
    try:
        s3.download_file(TARGET_BUCKET, key, local)
        return local
    except Exception as exc:
        logger.warning("download_to_tmp failed for %s: %s", key, exc)
        return None

def fetch_gradient() -> Image.Image|None:
    p = download_to_tmp(GRADIENT_KEY)
    if not p: return None
    return Image.open(p).convert("RGBA").resize((WIDTH, HEIGHT))

def fetch_logo(account: str) -> Image.Image|None:
    key = f"artifacts/{account.lower()}/logo.png"
    p = download_to_tmp(key)
    if not p: return None
    logo = Image.open(p).convert("RGBA")
    scale = 200/logo.width
    return logo.resize((int(logo.width*scale), int(logo.height*scale)))

def fetch_background(bg_type: str, key: str) -> Image.Image|None:
    if not key: return None
    local = download_to_tmp(key)
    if not local: return None
    if bg_type=="video" and VideoFileClip:
        try:
            with VideoFileClip(local) as clip:
                frame = clip.get_frame(clip.duration/2)
            img = Image.fromarray(frame).convert("RGBA")
        except Exception:
            return None
    else:
        img = Image.open(local).convert("RGBA")
    scale = WIDTH/img.width
    new_h = int(img.height*scale)
    img = img.resize((WIDTH,new_h), Image.LANCZOS)
    if new_h>HEIGHT:
        y0=(new_h-HEIGHT)//2
        img=img.crop((0,y0,WIDTH,y0+HEIGHT))
    return img

def render_item(item: Dict[str,Any], account: str) -> Image.Image:
    canvas = Image.new("RGBA",(WIDTH,HEIGHT),(0,0,0,255))
    bg_type = item.get("backgroundType","image").lower()
    bg = fetch_background(bg_type, item.get("s3Key",""))
    if bg: canvas.paste(bg,(0,0))
    grad = fetch_gradient()
    if grad: canvas.alpha_composite(grad)

    title = (item["title"] or "").upper()
    subtitle = (item.get("subtitle") or "").upper()
    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub   = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    t_font = autosize(title, TITLE_MAX, TITLE_MIN, 30)
    s_font = autosize(subtitle, DESC_MAX, DESC_MIN, 45)

    t_img = multiline_colored(title, hl_title, FONT_PATH_TITLE, t_font, 1000)
    sub_img = multiline_colored(subtitle, hl_sub, FONT_PATH_DESC, s_font, 900) if subtitle else None

    logo = fetch_logo(account)
    if logo:
        lx = WIDTH-logo.width-50
        ly = HEIGHT-logo.height-50
    else:
        ly = HEIGHT-100

    if sub_img:
        if bg_type!="video":
            y_sub = ly-50-sub_img.height
            y_title = y_sub-50-t_img.height
        else:
            y_sub = HEIGHT-300-sub_img.height
            y_title = 260
    else:
        y_title = HEIGHT-300-t_img.height if bg_type!="video" else 260

    canvas.alpha_composite(t_img, ((WIDTH-t_img.width)//2, y_title))
    if sub_img:
        canvas.alpha_composite(sub_img, ((WIDTH-sub_img.width)//2, y_sub))

    if logo:
        stripe = Image.new("RGBA",(700,4),ImageColor.getrgb(HIGHLIGHT_COLOR)+(255,))
        canvas.alpha_composite(stripe,(lx-720,ly+logo.height//2-2))
        canvas.alpha_composite(logo,(lx,ly))

    return canvas.convert("RGB")

def list_accounts() -> Set[str]:
    seen=set()
    for page in table.meta.client.get_paginator("scan").paginate(TableName=NEWS_TABLE,ProjectionExpression="accountName"):
        for i in page.get("Items",[]): seen.add(i["accountName"])
    return seen

def latest_items_for_account(account:str,limit:int=4)->List[Dict[str,Any]]:
    return table.query(KeyConditionExpression=Key("accountName").eq(account),ScanIndexForward=False,Limit=limit)["Items"]

def lambda_handler(event:Dict[str,Any],_ctx:Any)->Dict[str,Any]:
    logger.info("start")
    summary={}
    for account in list_accounts():
        items=latest_items_for_account(account)
        if not items: continue
        keys=[]
        ts=datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        for idx,item in enumerate(items):
            img=render_item(item,account)
            key=f"weekly_recap/{account}/recap_{ts}_{idx:03d}.png"
            buf=io.BytesIO(); img.save(buf,"PNG",compress_level=3); buf.seek(0)
            s3.upload_fileobj(buf,TARGET_BUCKET,key,ExtraArgs={"ContentType":"image/png"})
            keys.append(key)
        lambda_cl.invoke(FunctionName=NOTIFY_POST_ARN,InvocationType="Event",Payload=json.dumps({"accountName":account,"imageKeys":keys}).encode())
        summary[account]=len(keys)
    logger.info(f"complete: {summary}")
    return {"status":"complete","accounts":summary}

if __name__=="__main__":
    ev=json.loads(os.environ.get("EVENT_JSON","{}") or "{}")
    lambda_handler(ev,None)

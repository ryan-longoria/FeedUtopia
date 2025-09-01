# WrestleUtopia (Static MVP)

This is a static MVP of **WrestleUtopia** — a portal for indie wrestling recruiting.

## What's Included
- Multi-page site: Home, Talent (search + create profile), Promoters (post tryouts + view applications), Tryouts (apply), Terms, Privacy.
- Clean, responsive design (no frameworks); accessible forms.
- Demo data and persistence via **localStorage** (no backend required).
- PWA manifest, sitemap, robots.txt.
- Simple toast notifications.

## Local Preview
Open `index.html` in your browser. (If your browser blocks `dialog` on file URLs, use a simple local server:)
```bash
# Python 3
cd WrestleUtopia
python -m http.server 8080
# then visit http://localhost:8080
```

## How the Demo Works
- Seed data loads on first visit.
- Your submissions are saved in your browser storage (localStorage). Clear cache to reset.

## Suggested Production Stack
- **Frontend:** Next.js/React or keep static with forms posting to an API.
- **Backend:** AWS API Gateway + Lambda (Python) + RDS (Postgres) or DynamoDB.
- **Auth:** Cognito or Clerk.
- **Storage/CDN:** S3 + CloudFront, WAF.
- **Payments/ID:** Stripe Connect + Stripe Identity.
- **Search:** Postgres + trigram, later OpenSearch.
- **Workflows:** Step Functions for application → shortlist → invite.

## S3 + CloudFront Deploy (Quick)
1. Create S3 bucket (static website hosting) and upload the contents of this folder.
2. Enable public access via CloudFront with an Origin Access Control (OAC).
3. Point your domain (Route 53) to the CloudFront distribution (A/AAAA alias).
4. Add an ACM certificate for HTTPS.
5. Set default root object to `index.html`.

## Next Features to Build
- Real accounts + auth
- Organization (promotion/school) dashboards
- Server DB + real CRUD endpoints
- Scouting dashboard with advanced filters + export
- Moderation & verification flows
- Email notifications (SES)

© 2025 WrestleUtopia

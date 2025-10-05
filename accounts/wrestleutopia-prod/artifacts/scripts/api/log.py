import logging
import os
import sys
import time
from typing import Optional


def _safe_log_level(level_str: str) -> int:
    """
    Validate and safely parse the LOG_LEVEL environment variable.

    Returns a valid logging level (defaults to INFO) and prevents
    invalid or spoofed log levels from being applied.
    """
    valid_levels = {
        "CRITICAL": logging.CRITICAL,
        "ERROR": logging.ERROR,
        "WARNING": logging.WARNING,
        "INFO": logging.INFO,
        "DEBUG": logging.DEBUG,
    }
    return valid_levels.get(level_str.upper(), logging.INFO)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Return a structured, process-safe logger instance.

    Reads LOG_LEVEL from the environment and ensures consistent
    UTC timestamps, single handler initialization, and safe default
    logging behavior. In production, the level should be ERROR or above;
    in non-prod, DEBUG or INFO for traceability.
    """
    env_level = os.getenv("LOG_LEVEL", "INFO")
    level = _safe_log_level(env_level)

    logger = logging.getLogger(name or "wrestleutopia")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            fmt="%(asctime)sZ [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        logging.Formatter.converter = time.gmtime

        logger.setLevel(level)
        logger.propagate = False

    return logger

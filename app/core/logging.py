import logging, sys
def setup_logging():
    logging.basicConfig(stream=sys.stdout, level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
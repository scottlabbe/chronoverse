from cachetools import TTLCache
_cache = TTLCache(maxsize=2048, ttl=60)  # per-minute freshness

def get(key:str):
    try: return _cache[key]
    except KeyError: return None

def set(key:str, value:dict): _cache[key]=value
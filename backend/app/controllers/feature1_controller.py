from fastapi import APIRouter

router = APIRouter(prefix="/feature-1", tags=["feature-1"])


@router.get("")
def get_feature_1() -> dict[str, str]:
    # TODO: replace with real logic once a feature-1 model exists.
    return {"feature": "feature-1", "status": "placeholder"}

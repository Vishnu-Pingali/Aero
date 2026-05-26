from fastapi import HTTPException, status


def normalize_bbox(
    lamin: float,
    lomin: float,
    lamax: float,
    lomax: float,
    max_area: float,
) -> tuple[float, float, float, float]:
    if not (-90 <= lamin <= 90 and -90 <= lamax <= 90):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Latitude must be between -90 and 90.")
    if not (-180 <= lomin <= 180 and -180 <= lomax <= 180):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Longitude must be between -180 and 180.")
    if lamin >= lamax:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "lamin must be less than lamax.")
    if lomin >= lomax:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "lomin must be less than lomax.")

    area = (lamax - lamin) * (lomax - lomin)
    if area > max_area:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Bounding box is too large. Max area is {max_area} square degrees.",
        )

    return (round(lamin, 5), round(lomin, 5), round(lamax, 5), round(lomax, 5))

#!/usr/bin/env python3
"""Public entrypoint for SQLite shadow exports with current practical field mapping."""
from __future__ import annotations

import export_master_core as _impl

_impl.PRACTICAL_EXPORT_FIELDS.update({
    "practical.course_available": "courseAvailable",
    "practical.free_drink_available": "freeDrinkAvailable",
    "practical.free_food_available": "freeFoodAvailable",
    "practical.private_room_available": "privateRoomAvailable",
    "practical.card_available": "cardAvailable",
    "practical.parking_available": "parkingAvailable",
})

build_exports = _impl.build_exports


def main():
    _impl.main()


if __name__ == "__main__":
    main()

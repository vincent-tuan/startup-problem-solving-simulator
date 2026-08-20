export type CapacityReservationV10 = {
  id: string;
  capacity: number;
  reservedCapacity: number;
};

const rounded = (value: number): number => Math.round(value * 100) / 100;

export function availableCapacityV10(
  resource: CapacityReservationV10,
): number {
  return rounded(Math.max(0, resource.capacity - resource.reservedCapacity));
}

export function reserveCapacityV10(
  resource: CapacityReservationV10,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("CAPACITY_RESERVATION_INVALID");
  }
  if (amount > availableCapacityV10(resource) + 0.005) {
    throw new Error("CAPACITY_OVERBOOKED");
  }
  resource.reservedCapacity = rounded(resource.reservedCapacity + amount);
}

export function releaseCapacityV10(
  resource: CapacityReservationV10,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("CAPACITY_RELEASE_INVALID");
  }
  resource.reservedCapacity = rounded(
    Math.max(0, resource.reservedCapacity - amount),
  );
}

export function assertCapacityV10(resource: CapacityReservationV10): void {
  if (
    !Number.isFinite(resource.capacity) ||
    !Number.isFinite(resource.reservedCapacity) ||
    resource.capacity < 0 ||
    resource.reservedCapacity < 0 ||
    resource.reservedCapacity > resource.capacity + 0.005
  ) {
    throw new Error("CAPACITY_INVARIANT_FAILED");
  }
}

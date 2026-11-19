export const SHIP_CONFIG = {
  turnSpeed: 4.2,
  thrustAccel: 520,
  drag: 0.985,
  maxSpeed: 480,
};

export function createShip(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    thrust: false,
  };
}

export function integrate(ship, input, dt) {
  let { x, y, vx, vy, angle } = ship;

  if (input.isDown("ArrowLeft") || input.isDown("KeyA")) {
    angle -= SHIP_CONFIG.turnSpeed * dt;
  }
  if (input.isDown("ArrowRight") || input.isDown("KeyD")) {
    angle += SHIP_CONFIG.turnSpeed * dt;
  }

  const thrust = input.isDown("ArrowUp") || input.isDown("KeyW");
  if (thrust) {
    vx += Math.cos(angle) * SHIP_CONFIG.thrustAccel * dt;
    vy += Math.sin(angle) * SHIP_CONFIG.thrustAccel * dt;
  }

  const damping = SHIP_CONFIG.drag ** (dt * 60);
  vx *= damping;
  vy *= damping;

  const speed = Math.hypot(vx, vy);
  if (speed > SHIP_CONFIG.maxSpeed) {
    const scale = SHIP_CONFIG.maxSpeed / speed;
    vx *= scale;
    vy *= scale;
  }

  x += vx * dt;
  y += vy * dt;

  return { x, y, vx, vy, angle, thrust };
}

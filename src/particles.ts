import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import hiveLogoPng from "./hive-logo.png";

const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const Uniforms = d.struct({
  deltaTime: d.f32,
  hoverStrength: d.f32,
  time: d.f32,
  aspectRatio: d.f32,
  gravityStrength: d.f32,
  massCount: d.f32,
  wiggleOffsetScale: d.f32,
  wiggleForceScale: d.f32,
  repelStrength: d.f32,
});

type Vec2 = d.Infer<typeof d.vec2f>;

const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const logoPixelPositionsCache = new Map<number, Promise<Vec2[]>>();

async function loadLogoPixelPositions(edgeWeight: number): Promise<Vec2[]> {
  const cached = logoPixelPositionsCache.get(edgeWeight);
  if (cached) return cached;
  const promise = (async () => {
    const response = await fetch(hiveLogoPng);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width || 200;
    const height = bitmap.height || 200;
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : (() => {
            const element = document.createElement("canvas");
            element.width = width;
            element.height = height;
            return element;
          })();
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Logo mask unavailable");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const borderPositions: Vec2[] = [];
    const fillPositions: Vec2[] = [];
    const isSolid = (px: number, py: number) => {
      if (px < 0 || py < 0 || px >= width || py >= height) return false;
      const i = (py * width + px) * 4;
      return (data[i + 3] ?? 0) > 0;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isSolid(x, y)) continue;
        const touchesEmpty =
          !isSolid(x + 1, y) ||
          !isSolid(x - 1, y) ||
          !isSolid(x, y + 1) ||
          !isSolid(x, y - 1) ||
          !isSolid(x + 1, y + 1) ||
          !isSolid(x - 1, y - 1) ||
          !isSolid(x + 1, y - 1) ||
          !isSolid(x - 1, y + 1);
        const nx = ((x + 0.5) / width) * 2 - 1;
        const ny = ((height - (y + 0.5)) / height) * 2 - 1;
        fillPositions.push(d.vec2f(nx, ny));
        if (touchesEmpty) {
          borderPositions.push(d.vec2f(nx, ny));
        }
      }
    }
    if (fillPositions.length === 0) {
      throw new Error("Logo mask empty");
    }
    const positions: Vec2[] = [];
    positions.push(...fillPositions);
    const borderWeight = Math.max(1, Math.floor(edgeWeight));
    for (let i = 0; i < borderWeight; i++) {
      positions.push(...borderPositions);
    }
    return positions;
  })();
  logoPixelPositionsCache.set(edgeWeight, promise);
  return promise;
}

async function generateLogoPoints(
  count: number,
  edgeWeight: number,
  rng: () => number,
): Promise<Vec2[]> {
  const positions = await loadLogoPixelPositions(edgeWeight);
  const points: Vec2[] = [];
  const jitter = 0.0025;
  for (let i = 0; i < count; i++) {
    const base = positions[Math.floor(rng() * positions.length)]!;
    const dx = (rng() - 0.5) * jitter;
    const dy = (rng() - 0.5) * jitter;
    const x = Math.max(-1, Math.min(1, base.x + dx));
    const y = Math.max(-1, Math.min(1, base.y + dy));
    points.push(d.vec2f(x, y));
  }
  return points;
}

export interface ParticleSystem {
  setHovering: (hovering: boolean) => void;
  destroy: () => void;
}

export interface ParticleSystemOptions {
  particleCount: number;
  edgeWeight: number;
  scatter: number;
  seed: number;
  gravityStrength: number;
  wiggleOffsetScale: number;
  wiggleForceScale: number;
  repelStrength: number;
}

export async function createParticleSystem(
  canvas: HTMLCanvasElement,
  options: ParticleSystemOptions,
): Promise<ParticleSystem> {
  const {
    particleCount,
    edgeWeight,
    scatter,
    seed,
    gravityStrength,
    wiggleOffsetScale,
    wiggleForceScale,
    repelStrength,
  } = options;
  const rng = makeRng(seed);

  const root = await tgpu.init();
  const device = root.device;

  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("WebGPU not supported");
  }
  const gpuContext = context as GPUCanvasContext;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  gpuContext.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  });

  // Create uniforms
  const uniforms = root.createUniform(Uniforms);

  // Create sized array types for buffers
  const ParticleArraySized = d.arrayOf(Particle, particleCount);
  const MassArraySized = d.arrayOf(d.vec2f, particleCount);
  const RestArraySized = d.arrayOf(d.vec2f, particleCount);

  // Create unsized array types for bind group layout
  const ParticleArrayType = d.arrayOf(Particle);
  const TargetArrayType = d.arrayOf(d.vec2f);
  const RestArrayType = d.arrayOf(d.vec2f);

  const particleBuffers = [
    root.createBuffer(ParticleArraySized).$usage("storage", "vertex"),
    root.createBuffer(ParticleArraySized).$usage("storage", "vertex"),
  ] as const;

  const massBuffer = root.createBuffer(MassArraySized).$usage("storage");
  const restBuffer = root.createBuffer(RestArraySized).$usage("storage");

  // Initialize data
  const logoPoints = await generateLogoPoints(particleCount, edgeWeight, rng);
  const logoMassPoints = logoPoints.slice(0, particleCount);
  const maxOffset = scatter;
  const restPositions = logoMassPoints.map((t) => {
    const angle = rng() * Math.PI * 2;
    const radius = rng() * maxOffset;
    const rx = t.x + Math.cos(angle) * radius;
    const ry = t.y + Math.sin(angle) * radius;
    return d.vec2f(rx, ry);
  });
  const initialParticles = restPositions.map((p) => ({
    position: p,
    velocity: d.vec2f(0, 0),
  }));

  particleBuffers[0].write(initialParticles);
  particleBuffers[1].write(initialParticles);
  massBuffer.write(logoMassPoints);
  restBuffer.write(restPositions);

  // Compute bind group layout (uses unsized array types)
  const computeBindGroupLayout = tgpu.bindGroupLayout({
    particlesIn: { storage: ParticleArrayType },
    particlesOut: { storage: ParticleArrayType, access: "mutable" },
    massPoints: { storage: TargetArrayType },
    restTargets: { storage: RestArrayType },
  });

  const {
    particlesIn,
    particlesOut,
    massPoints: massPointsBinding,
    restTargets,
  } = computeBindGroupLayout.bound;

  // Simulation function
  const simulate = (index: number) => {
    "use gpu";
    const u = uniforms.$;
    const particle = Particle(particlesIn.value[index]!);
    const rest = restTargets.value[index]!;
    const pos = particle.position;
    const vel = particle.velocity;
    const hover = u.hoverStrength;
    const time = u.time;
    const dt = u.deltaTime;
    const particleIdx = d.f32(index);

    const massCount = d.i32(u.massCount);
    let nearest = massPointsBinding.value[0]!;
    let nearestDiff = std.sub(nearest, pos);
    let nearestDistSq = std.dot(nearestDiff, nearestDiff);
    for (let i = 1; i < massCount; i++) {
      const m = massPointsBinding.value[i]!;
      const diff = std.sub(m, pos);
      const distSq = std.dot(diff, diff);
      const closer = distSq < nearestDistSq;
      nearestDistSq = std.select(nearestDistSq, distSq, closer);
      nearestDiff = std.select(nearestDiff, diff, closer);
      nearest = std.select(nearest, m, closer);
    }

    const wigglePhaseX = time * 4.0 + particleIdx * 0.17;
    const wigglePhaseY = time * 3.4 + particleIdx * 0.11;
    const wiggle = d.vec2f(std.sin(wigglePhaseX), std.cos(wigglePhaseY));
    const wiggleOffset = std.mul(wiggle, u.wiggleOffsetScale * hover);
    const targetPos = std.add(nearest, wiggleOffset);

    const toTarget = std.sub(targetPos, pos);
    const targetDist = std.length(toTarget);
    const targetDir = std.select(
      d.vec2f(0, 0),
      std.mul(toTarget, 1.0 / targetDist),
      targetDist > 0.001,
    );

    const springStrength = std.mix(18.0, 32.0, hover);
    const dampingStrength = std.mix(12.0, 3.0, hover);
    const gravity = std.mul(targetDir, u.gravityStrength * hover);
    const springForce = std.mul(targetDir, targetDist * springStrength * hover);
    const dampingForce = std.mul(vel, -dampingStrength);

    const restForce = std.mul(std.sub(rest, pos), 6.0 * (1.0 - hover));

    const wiggleForce = std.mul(
      d.vec2f(
        std.sin(time * 5.5 + particleIdx * 0.23),
        std.cos(time * 5.2 + particleIdx * 0.29),
      ),
      u.wiggleForceScale * hover,
    );

    const repulsionRadius = 0.05;
    const repulsionRadiusSq = repulsionRadius * repulsionRadius;
    const repulsionStrength = u.repelStrength;
    let repulsionForce = d.vec2f(0, 0);
    const count = massCount;
    for (let step = 1; step <= 37; step += 12) {
      const neighborIdx = (index + step) % count;
      const other = Particle(particlesIn.value[neighborIdx]!);
      const diff = std.sub(pos, other.position);
      const distSq = std.dot(diff, diff);
      const within = distSq < repulsionRadiusSq;
      const safeDist = std.max(distSq, 1e-5);
      const invDist = std.div(1.0, std.sqrt(safeDist));
      const dir = std.mul(diff, invDist);
      const push = std.mul(
        dir,
        (repulsionRadius - std.sqrt(safeDist)) * repulsionStrength,
      );
      repulsionForce = std.select(
        repulsionForce,
        std.add(repulsionForce, push),
        within,
      );
    }

    const totalForce = std.add(
      restForce,
      std.add(
        repulsionForce,
        std.add(
          gravity,
          std.add(springForce, std.add(dampingForce, wiggleForce)),
        ),
      ),
    );

    // Update velocity with damping
    const damping = std.mix(0.8, 0.95, hover);
    particle.velocity = std.add(std.mul(vel, damping), std.mul(totalForce, dt));

    // Speed limit
    const speed = std.length(particle.velocity);
    const maxSpeed = std.mix(0.8, 3.2, hover);
    particle.velocity = std.select(
      particle.velocity,
      std.mul(particle.velocity, maxSpeed / speed),
      speed > maxSpeed,
    );

    // Update position
    particle.position = std.add(pos, std.mul(particle.velocity, dt));

    particlesOut.value[index] = Particle(particle);
  };

  const computePipeline =
    root["~unstable"].createGuardedComputePipeline(simulate);

  // Create compute bind groups for ping-pong
  const computeBindGroups = [0, 1].map((idx) =>
    root.createBindGroup(computeBindGroupLayout, {
      particlesIn: particleBuffers[idx]!,
      particlesOut: particleBuffers[1 - idx]!,
      massPoints: massBuffer,
      restTargets: restBuffer,
    }),
  );

  // Vertex layout for instanced rendering
  const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));
  const instanceLayout = tgpu.vertexLayout(ParticleArrayType, "instance");

  // Quad vertices (two triangles)
  const quadSize = 0.006;
  const quadVertexBuffer = root
    .createBuffer(d.arrayOf(d.vec2f, 6), [
      d.vec2f(-quadSize, -quadSize),
      d.vec2f(quadSize, -quadSize),
      d.vec2f(-quadSize, quadSize),
      d.vec2f(-quadSize, quadSize),
      d.vec2f(quadSize, -quadSize),
      d.vec2f(quadSize, quadSize),
    ])
    .$usage("vertex");

  // Vertex shader
  const VertexOutput = {
    position: d.builtin.position,
    color: d.vec4f,
    uv: d.vec2f,
  };

  const mainVert = tgpu["~unstable"].vertexFn({
    in: {
      quadPos: d.vec2f,
      particlePos: d.vec2f,
      particleVel: d.vec2f,
    },
    out: VertexOutput,
  })((input) => {
    "use gpu";
    const u = uniforms.$;
    const pos = std.add(input.particlePos, input.quadPos);

    // Apply aspect ratio correction to keep logo square and centered
    // aspect = width/height, so if aspect > 1, screen is wider than tall
    const aspect = u.aspectRatio;
    // Scale down the wider dimension to fit in a square
    const scaleX = std.min(1.0, 1.0 / aspect);
    const scaleY = std.min(1.0, aspect);
    const correctedX = pos.x * scaleX;
    const correctedY = pos.y * scaleY;

    // Color based on velocity - white particles
    const speed = std.length(input.particleVel);
    const brightness = std.mix(0.7, 1.0, speed * 2.0);

    return {
      position: d.vec4f(correctedX, correctedY, 0, 1),
      color: d.vec4f(brightness, brightness, brightness, 1),
      uv: std.mul(input.quadPos, 1.0 / quadSize),
    };
  });

  // Fragment shader
  const mainFrag = tgpu["~unstable"].fragmentFn({
    in: VertexOutput,
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const dist = std.length(input.uv);
    const alpha = 1.0 - dist;
    const smoothAlpha = alpha * alpha * alpha;

    return std.select(
      d.vec4f(0, 0, 0, 0),
      d.vec4f(input.color.x, input.color.y, input.color.z, smoothAlpha),
      dist < 1.0,
    );
  });

  // Render pipeline
  const renderPipeline = root["~unstable"]
    .withVertex(mainVert, {
      quadPos: vertexLayout.attrib,
      particlePos: instanceLayout.attrib.position,
      particleVel: instanceLayout.attrib.velocity,
    })
    .withFragment(mainFrag, {
      format: presentationFormat,
      blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
      },
    })
    .createPipeline()
    .with(vertexLayout, quadVertexBuffer);

  // State
  let isHovering = false;
  let hoverTransition = 0;
  let time = 0;
  let lastTime = performance.now();
  let frameId: number;
  let even = false;

  function animate() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    time += dt;

    // Smooth hover transition
    const targetHover = isHovering ? 1 : 0;
    const rate = targetHover > hoverTransition ? 5.0 : 1.2;
    hoverTransition += (targetHover - hoverTransition) * dt * rate;

    // Update uniforms
    uniforms.write({
      deltaTime: dt,
      hoverStrength: hoverTransition,
      time: time,
      aspectRatio: canvas.width / canvas.height,
      gravityStrength,
      massCount: logoMassPoints.length,
      wiggleOffsetScale,
      wiggleForceScale,
      repelStrength,
    });

    even = !even;

    // Run compute shader
    computePipeline
      .with(computeBindGroups[even ? 0 : 1]!)
      .dispatchThreads(particleCount);

    // Render
    renderPipeline
      .withColorAttachment({
        view: gpuContext.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      })
      .with(instanceLayout, particleBuffers[even ? 1 : 0]!)
      .draw(6, particleCount);

    frameId = requestAnimationFrame(animate);
  }

  animate();

  return {
    setHovering: (h: boolean) => {
      isHovering = h;
    },
    destroy: () => {
      cancelAnimationFrame(frameId);
      root.destroy();
    },
  };
}

import { useEffect, useRef, useState } from "react";
import { GUI } from "lil-gui";

import { createParticleSystem, type ParticleSystem } from "./particles";

import "./index.css";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const guiRef = useRef<GUI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [particleCount, setParticleCount] = useState(750);
  const [edgeWeight, setEdgeWeight] = useState(5);
  const [scatter, setScatter] = useState(0.3);
  const [gravityStrength, setGravityStrength] = useState(0.08);
  const [wiggleOffsetScale, setWiggleOffsetScale] = useState(0.003);
  const [wiggleForceScale, setWiggleForceScale] = useState(0.1);
  const [repelStrength, setRepelStrength] = useState(10);
  const [seed, setSeed] = useState(409969);
  const setHovering = (value: boolean) => {
    particleSystemRef.current?.setHovering(value);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    // Set initial canvas size
    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    updateCanvasSize();

    async function init(
      count: number,
      edge: number,
      scatterAmount: number,
      seedValue: number,
      gravity: number,
      wiggleOffset: number,
      wiggleForce: number,
      repel: number,
    ) {
      try {
        if (!navigator.gpu) {
          throw new Error("WebGPU is not supported in this browser");
        }

        const system = await createParticleSystem(canvas!, {
          particleCount: count,
          edgeWeight: edge,
          scatter: scatterAmount,
          seed: seedValue,
          gravityStrength: gravity,
          wiggleOffsetScale: wiggleOffset,
          wiggleForceScale: wiggleForce,
          repelStrength: repel,
        });

        if (mounted) {
          particleSystemRef.current = system;
          setLoading(false);
        } else {
          system.destroy();
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize");
          setLoading(false);
        }
      }
    }

    init(
      particleCount,
      edgeWeight,
      scatter,
      seed,
      gravityStrength,
      wiggleOffsetScale,
      wiggleForceScale,
      repelStrength,
    );
    const gui = new GUI({ title: "Particles" });
    guiRef.current = gui;
    const params = {
      particleCount,
      edgeWeight,
      scatter,
      seed,
      gravityStrength,
      wiggleOffsetScale,
      wiggleForceScale,
      repelStrength,
    };
    gui
      .add(params, "particleCount", 100, 3000, 50)
      .name("Count")
      .onFinishChange((value: number) => {
        setParticleCount(value);
        init(
          value,
          edgeWeight,
          scatter,
          seed,
          gravityStrength,
          wiggleOffsetScale,
          wiggleForceScale,
          repelStrength,
        );
      });
    gui
      .add(params, "edgeWeight", 1, 8, 1)
      .name("Edge weight")
      .onFinishChange((value: number) => {
        setEdgeWeight(value);
        init(
          particleCount,
          value,
          scatter,
          seed,
          gravityStrength,
          wiggleOffsetScale,
          wiggleForceScale,
          repelStrength,
        );
      });
    gui
      .add(params, "scatter", 0, 1.5, 0.05)
      .name("Scatter")
      .onFinishChange((value: number) => {
        setScatter(value);
        init(
          particleCount,
          edgeWeight,
          value,
          seed,
          gravityStrength,
          wiggleOffsetScale,
          wiggleForceScale,
          repelStrength,
        );
      });
    gui
      .add(params, "seed", 1, 1_000_000, 1)
      .name("Seed")
      .onFinishChange((value: number) => {
        setSeed(value);
        init(
          particleCount,
          edgeWeight,
          scatter,
          value,
          gravityStrength,
          wiggleOffsetScale,
          wiggleForceScale,
          repelStrength,
        );
      });
    gui
      .add(params, "gravityStrength", 0.01, 2, 0.05)
      .name("Gravity")
      .onFinishChange((value: number) => {
        setGravityStrength(value);
        init(
          particleCount,
          edgeWeight,
          scatter,
          seed,
          value,
          wiggleOffsetScale,
          wiggleForceScale,
          repelStrength,
        );
      });
    gui
      .add(params, "wiggleOffsetScale", 0, 0.02, 0.001)
      .name("Wiggle offset")
      .onFinishChange((value: number) => {
        setWiggleOffsetScale(value);
        init(
          particleCount,
          edgeWeight,
          scatter,
          seed,
          gravityStrength,
          value,
          wiggleForceScale,
          repelStrength,
        );
      });
    gui
      .add(params, "wiggleForceScale", 0, 1, 0.02)
      .name("Wiggle force")
      .onFinishChange((value: number) => {
        setWiggleForceScale(value);
        init(
          particleCount,
          edgeWeight,
          scatter,
          seed,
          gravityStrength,
          wiggleOffsetScale,
          value,
          repelStrength,
        );
      });
    gui
      .add(params, "repelStrength", 0, 2000, 0.2)
      .name("Repel")
      .onFinishChange((value: number) => {
        setRepelStrength(value);
        init(
          particleCount,
          edgeWeight,
          scatter,
          seed,
          gravityStrength,
          wiggleOffsetScale,
          wiggleForceScale,
          value,
        );
      });

    window.addEventListener("resize", updateCanvasSize);

    return () => {
      mounted = false;
      window.removeEventListener("resize", updateCanvasSize);
      particleSystemRef.current?.destroy();
      particleSystemRef.current = null;
      guiRef.current?.destroy();
      guiRef.current = null;
    };
  }, [
    particleCount,
    edgeWeight,
    scatter,
    seed,
    gravityStrength,
    wiggleOffsetScale,
    wiggleForceScale,
    repelStrength,
  ]);

  return (
    <main className="overflow-hidden fixed inset-0">
      <canvas ref={canvasRef} className="w-full! h-full!" />
      <div className="absolute inset-0 top-2/5 flex items-center justify-center">
        <div
          className="absolute p-8 flex items-center justify-center"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onTouchStart={() => setHovering(true)}
          onTouchEnd={() => setHovering(false)}
        >
          <button className="backdrop-blur-[3px] bg-white/1 px-6 py-3 text-white shadow-[0_1px_16px_rgb(from_#E1FF05_r_g_b/.1),0_1px_2px_rgb(from_#E1FF05_r_g_b/.1),0_0_0_1px_rgb(from_#fff_r_g_b/.075)] rounded-lg cursor-pointer hover:shadow-[0_1px_16px_rgb(from_#E1FF05_r_g_b/.2),0_1px_2px_rgb(from_#E1FF05_r_g_b/.2),0_0_0_1px_rgb(from_#fff_r_g_b/.15)] transition-all duration-200 ease-out hover:duration-50">
            Sign up
          </button>
        </div>
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50">
          Loading...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-red-900/80 text-white p-4 rounded max-w-sm text-center">
            <p className="font-bold mb-2">WebGPU Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

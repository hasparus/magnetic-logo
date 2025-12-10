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
      seedValue: number
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

    init(particleCount, edgeWeight, scatter, seed);
    const gui = new GUI({ title: "Particles" });
    guiRef.current = gui;
    const params = {
      particleCount,
      edgeWeight,
      scatter,
      seed,
    };
    gui
      .add(params, "particleCount", 100, 3000, 50)
      .name("Count")
      .onFinishChange((value: number) => {
        setParticleCount(value);
        init(value, edgeWeight, scatter, seed);
      });
    gui
      .add(params, "edgeWeight", 1, 8, 1)
      .name("Edge weight")
      .onFinishChange((value: number) => {
        setEdgeWeight(value);
        init(particleCount, value, scatter, seed);
      });
    gui
      .add(params, "scatter", 0, 1.5, 0.05)
      .name("Scatter")
      .onFinishChange((value: number) => {
        setScatter(value);
        init(particleCount, edgeWeight, value, seed);
      });
    gui
      .add(params, "seed", 1, 1_000_000, 1)
      .name("Seed")
      .onFinishChange((value: number) => {
        setSeed(value);
        init(particleCount, edgeWeight, scatter, value);
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
  }, [particleCount, edgeWeight, scatter, seed]);

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
            Join the Hive
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

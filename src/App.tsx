import { useEffect, useRef, useState } from "react";
import "./index.css";
import { createParticleSystem, type ParticleSystem } from "./particles";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

    async function init() {
      try {
        if (!navigator.gpu) {
          throw new Error("WebGPU is not supported in this browser");
        }

        const system = await createParticleSystem(canvas!);

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

    init();

    // Handle resize
    const handleResize = () => {
      updateCanvasSize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      mounted = false;
      window.removeEventListener("resize", handleResize);
      particleSystemRef.current?.destroy();
      particleSystemRef.current = null;
    };
  }, []);

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
            Join Hive
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

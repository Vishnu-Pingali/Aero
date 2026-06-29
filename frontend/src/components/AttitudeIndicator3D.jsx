import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export function AttitudeIndicator3D({ heading = 0, altitude = 0, verticalRate = 0, phase = "cruise", callsign = "" }) {
  const containerRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── Scene, Camera, Renderer Setup ──────────────────────────────────────────
    const width = containerRef.current.clientWidth || 342;
    const height = 180;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x08121e, 0.015);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 2.5, 9.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // ── Lighting Setup ──────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00f2ff, 1.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffca7a, 1.5, 15);
    pointLight.position.set(-4, -2, -3);
    scene.add(pointLight);

    // ── Futuristic Telemetry HUD Grid ───────────────────────────────────────────
    const hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // Artificial horizon circular guides
    const ringGeo1 = new THREE.RingGeometry(3.5, 3.55, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x00f2ff, opacity: 0.12, transparent: true, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 2;
    hudGroup.add(ring1);

    const ringGeo2 = new THREE.RingGeometry(2.0, 2.05, 32);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xffca7a, opacity: 0.08, transparent: true, side: THREE.DoubleSide });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.x = Math.PI / 2;
    hudGroup.add(ring2);

    // Compass dial lines
    const gridHelper = new THREE.GridHelper(10, 20, 0x00f2ff, 0x08253a);
    gridHelper.position.y = -1.5;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    hudGroup.add(gridHelper);

    // ── Programmatic 3D Aircraft Model ─────────────────────────────────────────
    const airplane = new THREE.Group();
    scene.add(airplane);

    // Neon emissive properties for futuristic aviation visuals
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0c253f,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x002c40,
    });

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x0a1e33,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x00f2ff,
      emissiveIntensity: 0.15,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffca7a,
      roughness: 0.05,
      metalness: 0.9,
      emissive: 0xffa500,
      emissiveIntensity: 0.4,
    });

    // Fuselage
    const fuselageGeo = new THREE.CylinderGeometry(0.42, 0.25, 4.5, 16);
    fuselageGeo.rotateX(Math.PI / 2);
    const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
    airplane.add(fuselage);

    // Nose Cone
    const noseGeo = new THREE.ConeGeometry(0.42, 0.9, 16);
    noseGeo.rotateX(Math.PI / 2);
    noseGeo.translate(0, 0, 2.7); // move forward
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    airplane.add(nose);

    // Cockpit Window
    const cockpitGeo = new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cockpitGeo.scale(1, 0.45, 1.4);
    cockpitGeo.translate(0, 0.3, 1.9);
    const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
    airplane.add(cockpit);

    // Main Wings (Left/Right box)
    const wingGeo = new THREE.BoxGeometry(6.2, 0.06, 1.0);
    // Taper wing tips programmatically
    const pos = wingGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let z = pos.getZ(i);
      if (Math.abs(x) > 2) {
        // Taper tail edge of wing tips
        pos.setZ(i, z * 0.55);
      }
    }
    wingGeo.computeVertexNormals();
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, -0.05, 0.2);
    airplane.add(wing);

    // Tail Stabilizers
    const tailStabGeo = new THREE.BoxGeometry(2.0, 0.04, 0.45);
    const tailStab = new THREE.Mesh(tailStabGeo, wingMat);
    tailStab.position.set(0, 0.1, -1.9);
    airplane.add(tailStab);

    // Vertical Fin
    const finGeo = new THREE.BoxGeometry(0.04, 0.8, 0.6);
    // Taper fin
    const finPos = finGeo.attributes.position;
    for (let i = 0; i < finPos.count; i++) {
      let y = finPos.getY(i);
      let z = finPos.getZ(i);
      if (y > 0) {
        finPos.setZ(i, z * 0.4);
      }
    }
    finGeo.computeVertexNormals();
    const fin = new THREE.Mesh(finGeo, bodyMat);
    fin.position.set(0, 0.5, -1.9);
    fin.rotation.x = -Math.PI / 12;
    airplane.add(fin);

    // Turbines (Left and Right engines)
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x112b47, metalness: 0.9, roughness: 0.1 });
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xffca7a, side: THREE.DoubleSide });

    const leftEngine = new THREE.Group();
    leftEngine.position.set(-1.4, -0.25, 0.4);
    const rightEngine = new THREE.Group();
    rightEngine.position.set(1.4, -0.25, 0.4);

    const engineCylGeo = new THREE.CylinderGeometry(0.24, 0.2, 0.8, 12);
    engineCylGeo.rotateX(Math.PI / 2);
    
    const engL = new THREE.Mesh(engineCylGeo, engineMat);
    const engR = new THREE.Mesh(engineCylGeo, engineMat);
    leftEngine.add(engL);
    rightEngine.add(engR);

    // Engine Fan blades (will rotate!)
    const fanGeo = new THREE.BoxGeometry(0.38, 0.02, 0.06);
    
    const fanGroupL = new THREE.Group();
    fanGroupL.position.set(0, 0, 0.38);
    const fanGroupR = new THREE.Group();
    fanGroupR.position.set(0, 0, 0.38);

    for (let i = 0; i < 6; i++) {
      const bladeL = new THREE.Mesh(fanGeo, bladeMat);
      bladeL.rotation.z = (Math.PI / 3) * i;
      fanGroupL.add(bladeL);

      const bladeR = new THREE.Mesh(fanGeo, bladeMat);
      bladeR.rotation.z = (Math.PI / 3) * i;
      fanGroupR.add(bladeR);
    }
    
    leftEngine.add(fanGroupL);
    rightEngine.add(fanGroupR);

    airplane.add(leftEngine);
    airplane.add(rightEngine);

    // ── Drag Interaction controls ──────────────────────────────────────────────
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handlePointerDown = (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e) => {
      if (!isDragging) return;
      const deltaMove = {
        x: e.clientX - previousMousePosition.x,
        y: e.clientY - previousMousePosition.y
      };

      targetRotationY += deltaMove.x * 0.007;
      targetRotationX += deltaMove.y * 0.007;

      // Restrict camera flip
      targetRotationX = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, targetRotationX));

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    // ── Animation Loop ──────────────────────────────────────────────────────────
    let ticks = 0;
    
    const animate = () => {
      ticks += 0.025;

      // Spin engine fan blades
      fanGroupL.rotation.z += 0.25;
      fanGroupR.rotation.z += 0.25;

      // Compute pitch from vertical rate (feet per minute)
      // Clamped to +/- 22 degrees
      const vr = Number(verticalRate) || 0;
      const pitchTarget = Math.max(-0.4, Math.min(0.4, (vr / 3000) * 0.4));
      
      // Calculate dynamic roll: bank into turning angles (emulate flight path rotation)
      // If heading changes, aircraft rolls. We'll add a subtle sway when cruising
      let rollTarget = 0;
      if (phase === "climb" || phase === "descend") {
        rollTarget = Math.sin(ticks) * 0.04; // subtle wind drift roll
      } else if (phase === "cruise") {
        rollTarget = Math.sin(ticks * 0.5) * 0.03;
      }

      // Smooth interpolation (lerp) toward target telemetry
      airplane.rotation.x = THREE.MathUtils.lerp(airplane.rotation.x, pitchTarget, 0.06);
      airplane.rotation.z = THREE.MathUtils.lerp(airplane.rotation.z, -rollTarget, 0.06);

      // Rotate grid/compass elements matching heading
      const targetHdgRad = (heading * Math.PI) / 180;
      gridHelper.rotation.y = THREE.MathUtils.lerp(gridHelper.rotation.y, -targetHdgRad, 0.06);

      // Apply drag rotation to parent airplane node or camera
      if (!isDragging) {
        // Slow self-alignment/auto-rotation when idle
        targetRotationY += 0.0015;
      }
      airplane.rotation.y = THREE.MathUtils.lerp(airplane.rotation.y, targetRotationY, 0.05);
      
      // Pitch adjustment by dragging translates to local camera elevation
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 2.5 + Math.sin(targetRotationX) * 3, 0.05);

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(requestRef.current);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      scene.clear();
      renderer.dispose();
    };
  }, [heading, verticalRate, phase]);

  return (
    <div className="relative w-full h-[180px] rounded-xl overflow-hidden glass-panel border border-on-surface/5 flex flex-col justify-between p-3 select-none">
      {/* 3D viewport canvas mounts here */}
      <div ref={containerRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />
      
      {/* Attitude details overlay */}
      <div className="z-10 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-primary font-bold tracking-widest uppercase">3D TELEMETRY HUD</span>
          <span className="text-[9px] font-mono text-on-surface-variant">DRAG TO ROTATE MODEL</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-tertiary-fixed bg-tertiary-fixed/10 px-2 py-0.5 rounded uppercase">
          {phase}
        </span>
      </div>

      <div className="z-10 flex justify-between items-end pointer-events-none font-mono text-[9px] text-on-surface-variant">
        <div className="flex gap-3">
          <div>HDG <span className="text-primary font-semibold">{Math.round(heading)}°</span></div>
          <div>V/S <span className="text-primary font-semibold">{verticalRate > 0 ? '+' : ''}{verticalRate} FPM</span></div>
        </div>
        <div>ALT <span className="text-primary font-semibold">{altitude.toLocaleString()} FT</span></div>
      </div>
    </div>
  );
}

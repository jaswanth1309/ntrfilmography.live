import React, { useEffect, useRef } from 'react';

export default function PremiumRunningTiger({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let t = 0;

    // Adjust for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const width = 480;
    const height = 200;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Speed of action loop
    const speedCoeff = 0.08;

    // Fire sparks particle system
    const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number; color: string }> = [];

    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, width, height);

      t += speedCoeff;

      // Base coordinate setup - Center of canvas
      const cx = 240;
      const cy = 100;

      // Leaping cycle: body arches, dives, and stretches
      // Using sine of t to drive the powerful, fluid jump cycle
      const leapSin = Math.sin(t);
      const leapCos = Math.cos(t);

      // Tiger vertical bobbing in mid-leap
      const offsetY = leapSin * 10 - 5;
      const bodyArch = leapCos * 0.15; // Body arch angle

      // Torso core points
      const bodyLen = 135 + leapSin * 10; // Stretches on leap extension
      const shoulderX = cx + bodyLen / 2;
      const shoulderY = cy + offsetY - 10 + bodyArch * 15;
      const hipX = cx - bodyLen / 2;
      const hipY = cy + offsetY - 2 - bodyArch * 10;

      const spineX = (shoulderX + hipX) / 2;
      const spineY = (shoulderY + hipY) / 2 - 12 - Math.abs(leapCos) * 8; // Powerful hump

      // Head / Neck positioning
      const headX = shoulderX + 28 + leapCos * 3;
      const headY = shoulderY - 22 + leapSin * 4;

      // Generate RRR fire sparks/embers trailing from the tiger's feet and body
      if (Math.random() < 0.6) {
        particles.push({
          x: hipX + Math.random() * 20,
          y: hipY + Math.random() * 20,
          vx: -(3 + Math.random() * 5),
          vy: (Math.random() - 0.5) * 3,
          size: 1.5 + Math.random() * 3,
          alpha: 1.0,
          color: Math.random() > 0.4 ? 'rgba(249, 115, 22, 0.8)' : 'rgba(239, 68, 68, 0.9)' // Amber or Red sparks
        });
      }

      // Update and draw fire particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // LEG DRAWER FUNCTIONS FOR THE RRR LEAP (Extended high-octane leap legs)
      const drawLeapLeg = (originX: number, originY: number, angleOffset: number, isFront: boolean, isFarSide: boolean) => {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // High contrast coloring for far vs near side legs
        const legColor = isFarSide ? '#9a3412' : '#ea580c';
        const shadowColor = isFarSide ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)';
        const whiteHighlight = isFarSide ? 'rgba(220, 220, 220, 0.6)' : '#ffffff';

        // Calculate knee/elbow joints for fully extended leap pose
        let targetX = 0;
        let targetY = 0;
        let jointX = 0;
        let jointY = 0;

        if (isFront) {
          // Front legs reaching far FORWARD in a leap
          const extendPercent = 0.85 + leapSin * 0.15;
          targetX = originX + 75 * extendPercent;
          targetY = originY + (isFarSide ? 32 : 24) + leapCos * 8;

          // Elbow bent slightly backward
          jointX = (originX + targetX) / 2 - 8;
          jointY = (originY + targetY) / 2 - 12;
        } else {
          // Rear legs launching far BACKWARD
          const extendPercent = 0.9 + leapCos * 0.1;
          targetX = originX - 85 * extendPercent;
          targetY = originY + (isFarSide ? 22 : 14) - leapSin * 6;

          // Knee joint bent forward
          jointX = (originX + targetX) / 2 + 15;
          jointY = (originY + targetY) / 2 - 16;
        }

        // Draw Thigh / Upper Arm
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.quadraticCurveTo(jointX, jointY, jointX, jointY);
        ctx.strokeStyle = legColor;
        ctx.lineWidth = isFront ? 15 : 19;
        ctx.stroke();

        // Draw Shin
        ctx.beginPath();
        ctx.moveTo(jointX, jointY);
        ctx.lineTo(targetX, targetY);
        ctx.strokeStyle = legColor;
        ctx.lineWidth = isFront ? 11 : 13;
        ctx.stroke();

        // White highlight undercoat on legs
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(jointX, jointY);
        ctx.lineTo(targetX, targetY);
        ctx.strokeStyle = whiteHighlight;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Draw Paw with sharp claws extended!
        ctx.beginPath();
        ctx.arc(targetX, targetY, isFront ? 8 : 9, 0, Math.PI * 2);
        ctx.fillStyle = legColor;
        ctx.fill();

        // Draw claws (vicious white slashes on front paws)
        if (isFront) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Claw 1
          ctx.moveTo(targetX + 6, targetY + 2);
          ctx.lineTo(targetX + 13, targetY - 2);
          // Claw 2
          ctx.moveTo(targetX + 5, targetY + 5);
          ctx.lineTo(targetX + 12, targetY + 3);
          // Claw 3
          ctx.moveTo(targetX + 3, targetY + 8);
          ctx.lineTo(targetX + 9, targetY + 8);
          ctx.stroke();
        }

        // Black stripes on joints
        ctx.fillStyle = 'rgba(24, 24, 27, 0.95)';
        ctx.beginPath();
        ctx.moveTo(jointX - 4, jointY - 2);
        ctx.lineTo(jointX + 5, jointY + 1);
        ctx.lineTo(jointX - 4, jointY + 4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      };

      // 1. Draw Far Legs (Behind body)
      drawLeapLeg(shoulderX, shoulderY, 0.4, true, true);
      drawLeapLeg(hipX, hipY, -0.3, false, true);

      // 2. Draw Tail (Whipping backwards in a powerful S-curve)
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      let tailX = hipX - 5;
      let tailY = hipY - 2;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      
      const segments = 6;
      const segmentLen = 12;
      for (let i = 0; i < segments; i++) {
        // High frequency whipping motion
        const wave = Math.sin(t * 2 - i * 0.6) * 0.45;
        const angle = -Math.PI / 3.5 + wave;
        const nextX = tailX - Math.cos(angle) * segmentLen;
        const nextY = tailY + Math.sin(angle) * segmentLen;
        ctx.lineTo(nextX, nextY);
        tailX = nextX;
        tailY = nextY;
      }
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 8;
      ctx.stroke();

      // Tail white & black tips
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(tailX - 6, tailY + 4);
      ctx.stroke();

      ctx.strokeStyle = '#18181b';
      ctx.beginPath();
      ctx.moveTo(tailX - 4, tailY + 2);
      ctx.lineTo(tailX - 10, tailY + 6);
      ctx.stroke();
      ctx.restore();

      // 3. Draw Powerful Torso (Muscular, streamlined)
      ctx.save();
      const torsoGrad = ctx.createLinearGradient(hipX, cy, shoulderX, cy);
      torsoGrad.addColorStop(0, '#c2410c'); // Deep copper/crimson orange
      torsoGrad.addColorStop(0.4, '#ea580c');
      torsoGrad.addColorStop(0.8, '#f97316'); // Golden highlight
      torsoGrad.addColorStop(1, '#c2410c');

      ctx.fillStyle = torsoGrad;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.quadraticCurveTo(spineX, spineY, shoulderX, shoulderY);
      ctx.lineTo(shoulderX + 8, shoulderY + 16);
      ctx.quadraticCurveTo(spineX, spineY + 36, hipX - 5, hipY + 15);
      ctx.closePath();
      ctx.fill();

      // White belly underbelly fur
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(hipX + 18, hipY + 12);
      ctx.quadraticCurveTo(spineX, spineY + 28, shoulderX - 12, shoulderY + 18);
      ctx.lineTo(shoulderX - 22, shoulderY + 8);
      ctx.quadraticCurveTo(spineX, spineY + 18, hipX + 22, hipY + 4);
      ctx.closePath();
      ctx.fill();

      // Thick powerful feline stripes
      ctx.fillStyle = '#18181b';
      const drawTorsoStripe = (sx: number, sy: number, length: number, angle: number) => {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(4, length / 2, 0, length);
        ctx.quadraticCurveTo(-4, length / 2, 0, 0);
        ctx.fill();
        ctx.restore();
      };

      // Intense wild stripes across back
      drawTorsoStripe(spineX - 40, spineY + 6, 20, Math.PI / 2.2);
      drawTorsoStripe(spineX - 20, spineY + 5, 26, Math.PI / 2.0);
      drawTorsoStripe(spineX, spineY + 4, 24, Math.PI / 1.9);
      drawTorsoStripe(spineX + 20, spineY + 6, 22, Math.PI / 1.7);
      drawTorsoStripe(spineX + 40, spineY + 8, 16, Math.PI / 1.5);

      // Hip claws/stripes
      drawTorsoStripe(hipX + 15, hipY + 3, 16, Math.PI / 2.6);
      drawTorsoStripe(hipX + 24, hipY + 6, 18, Math.PI / 2.4);
      ctx.restore();

      // 4. Draw Near Legs (In front of body)
      drawLeapLeg(shoulderX, shoulderY, 0, true, false);
      drawLeapLeg(hipX, hipY, 0, false, false);

      // 5. Draw Neck & Roaring Head (Jaws open wide, teeth bared)
      ctx.save();
      
      // Neck muscle
      ctx.fillStyle = '#c2410c';
      ctx.beginPath();
      ctx.moveTo(shoulderX - 4, shoulderY - 6);
      ctx.quadraticCurveTo(shoulderX + 15, shoulderY - 18, headX, headY + 2);
      ctx.lineTo(headX - 8, headY + 16);
      ctx.quadraticCurveTo(shoulderX + 4, shoulderY + 20, shoulderX - 4, shoulderY + 10);
      ctx.closePath();
      ctx.fill();

      // White neck fur
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(shoulderX + 12, shoulderY + 15);
      ctx.quadraticCurveTo(shoulderX + 22, shoulderY + 2, headX - 2, headY + 14);
      ctx.lineTo(headX - 14, headY + 5);
      ctx.quadraticCurveTo(shoulderX + 14, shoulderY + 2, shoulderX + 4, shoulderY + 10);
      ctx.closePath();
      ctx.fill();

      // Roaring Head (Upper Jaw / skull)
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      // Crown of skull
      ctx.arc(headX, headY, 13, 0, Math.PI * 2);
      ctx.fill();

      // Snout (Muzzle pointing forward, bared teeth profile)
      ctx.beginPath();
      ctx.moveTo(headX, headY - 6);
      ctx.lineTo(headX + 22, headY - 5); // Upper lip extend
      ctx.lineTo(headX + 15, headY + 3);  // Upper teeth line
      ctx.lineTo(headX - 2, headY + 3);
      ctx.closePath();
      ctx.fill();

      // Roaring Lower Jaw (Dropped wide open!)
      ctx.fillStyle = '#c2410c';
      ctx.beginPath();
      ctx.moveTo(headX - 4, headY + 3);
      ctx.lineTo(headX + 12, headY + 5);  // Back of mouth joint
      ctx.lineTo(headX + 18, headY + 18); // Lower jaw extended far down
      ctx.lineTo(headX + 6, headY + 20);  // Chin
      ctx.lineTo(headX - 6, headY + 11);
      ctx.closePath();
      ctx.fill();

      // Inner Red/Pink Roaring Mouth Throat
      ctx.fillStyle = '#b91c1c'; // Red throat
      ctx.beginPath();
      ctx.moveTo(headX + 2, headY + 2);
      ctx.lineTo(headX + 13, headY + 2);
      ctx.lineTo(headX + 12, headY + 12);
      ctx.lineTo(headX + 4, headY + 9);
      ctx.closePath();
      ctx.fill();

      // Sharp white fangs! (Bared upper & lower teeth)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      // Upper large fang
      ctx.moveTo(headX + 17, headY - 1);
      ctx.lineTo(headX + 19, headY + 6);
      ctx.lineTo(headX + 15, headY + 2);
      ctx.closePath();
      // Lower large fang
      ctx.moveTo(headX + 14, headY + 11);
      ctx.lineTo(headX + 16, headY + 5);
      ctx.lineTo(headX + 11, headY + 9);
      ctx.closePath();
      ctx.fill();

      // Black nose bridge & nose tip
      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.moveTo(headX + 18, headY - 6);
      ctx.lineTo(headX + 23, headY - 5);
      ctx.lineTo(headX + 20, headY - 2);
      ctx.closePath();
      ctx.fill();

      // Golden glowing RRR eye (Full intensity)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(headX + 6, headY - 3, 3, 2, Math.PI / 10, 0, Math.PI * 2);
      ctx.fill();
      // Intense amber pupil
      ctx.fillStyle = '#f59e0b';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#fbbf24';
      ctx.beginPath();
      ctx.arc(headX + 7, headY - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // Reset shadow

      // White cheek accents
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(headX - 2, headY + 6, 7, 0, Math.PI * 2);
      ctx.fill();

      // Facial tiger wrinkles & stripes
      ctx.fillStyle = '#18181b';
      // Forehead frown stripes
      ctx.beginPath();
      ctx.moveTo(headX + 2, headY - 12);
      ctx.lineTo(headX + 5, headY - 7);
      ctx.lineTo(headX + 7, headY - 11);
      ctx.closePath();
      ctx.fill();

      // Back-pinned fierce ears (Aerodynamic look)
      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.ellipse(headX - 8, headY - 12, 5, 8, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(headX - 7, headY - 11, 2.5, 5, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [progress]);

  return (
    <div className="relative w-full flex justify-center items-center">
      <canvas ref={canvasRef} className="drop-shadow-[0_4px_30px_rgba(239,68,68,0.45)]" />
    </div>
  );
}

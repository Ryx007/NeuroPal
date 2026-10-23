import { GLView } from "expo-gl";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { hexToRgb } from "../../theme/tokens";

// Signal's living background: Chladni plate nodal lines (sand gathering
// where the plate doesn't move, morphing between (n, m) modes) or two-source
// interference fringes. One fragment shader on expo-gl (OpenGL ES natively,
// WebGL on web). Decorative chrome only — never behind reading content.
//
// Props are read through a ref inside the render loop, so changing accent,
// speed or mode never rebuilds the GL context. speed 0 = draw one still
// frame and stop the loop (motion "Still", reduce-motion, unfocused screen).

const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
// highp where the GPU has it (all current phones): with mediump (fp16 on
// Adreno/Mali/Apple) the sand noise and the growing time value lose
// precision. The hash keeps its inputs small (Hoskins' hash12 on p mod 289)
// so it also holds up at mediump.
const FRAG =
  "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n" +
  "uniform vec2 r;uniform float t;uniform vec3 c;uniform vec3 b;uniform float m;uniform float k;" +
  "float h(vec2 p){p=mod(p,289.);vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}" +
  "float cl(vec2 p,float n,float q){return cos(n*3.14159*p.x)*cos(q*3.14159*p.y)-cos(q*3.14159*p.x)*cos(n*3.14159*p.y);}" +
  "void main(){vec2 p=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);float v=0.;" +
  "if(m<.5){float i=floor(t/9.);float s=smoothstep(.2,.8,fract(t/9.));" +
  "float n1=1.+mod(i,3.);float q1=n1+2.+2.*mod(i,2.);float n2=1.+mod(i+1.,3.);float q2=n2+2.+2.*mod(i+1.,2.);" +
  "vec2 u=p*.9+.5;float f=mix(cl(u,n1,q1),cl(u,n2,q2),s);float z=f/.075;float l=exp(-z*z);" +
  "float g=step(h(floor(gl_FragCoord.xy/3.)+floor(t*7.)),l*.95);v=l*.2+g*.8;}" +
  "else{vec2 s1=vec2(-.14,-.62);vec2 s2=vec2(.14,-.62);float d=distance(p,s1)-distance(p,s2);" +
  "float I=cos(24.*d);I=I*I;float e=exp(-1.*length(p-vec2(0.,-.62)));float w=.5+.5*sin(42.*distance(p,s1)-t*1.7);v=I*e*.95+w*e*.14;}" +
  "gl_FragColor=vec4(mix(b,c,clamp(v*k,0.,1.)),1.);}";

export function SignalField({ mode = "Chladni", accent = "#FF3D2E", background = "#141416", speed = 1, amplitude = 0.62, style }) {
  const cfg = useRef({});
  const accentRgb = hexToRgb(accent) || [255, 61, 46];
  const bgRgb = hexToRgb(background) || [20, 20, 22];
  cfg.current = {
    mode: mode === "Interference" ? 1 : 0,
    c: accentRgb.map((x) => x / 255),
    b: bgRgb.map((x) => x / 255),
    speed,
    amp: amplitude,
  };
  const kick = useRef(null);

  // When a still field's look changes (accent/mode/base), redraw one frame.
  useEffect(() => {
    if (kick.current) kick.current();
  }, [mode, accent, background, speed, amplitude]);

  const raf = useRef(null);
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      kick.current = null;
    },
    []
  );

  const onContextCreate = (gl) => {
    try {
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, VERT));
      gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      gl.useProgram(pr);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u = {
        r: gl.getUniformLocation(pr, "r"),
        t: gl.getUniformLocation(pr, "t"),
        c: gl.getUniformLocation(pr, "c"),
        b: gl.getUniformLocation(pr, "b"),
        m: gl.getUniformLocation(pr, "m"),
        k: gl.getUniformLocation(pr, "k"),
      };
      let simT = 4.5;
      let last = Date.now();

      const draw = () => {
        const p = cfg.current;
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.r, w, h);
        gl.uniform1f(u.t, simT);
        gl.uniform3f(u.c, p.c[0], p.c[1], p.c[2]);
        gl.uniform3f(u.b, p.b[0], p.b[1], p.b[2]);
        gl.uniform1f(u.m, p.mode);
        gl.uniform1f(u.k, p.amp);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();
        if (gl.endFrameEXP) gl.endFrameEXP();
      };

      const loop = () => {
        raf.current = null;
        const now = Date.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const p = cfg.current;
        simT += dt * p.speed;
        // Wrap after 100 Chladni cycles (6 modes × 9 s) so time stays small.
        if (simT > 5400) simT -= 5400;
        draw();
        if (p.speed > 0) raf.current = requestAnimationFrame(loop);
      };

      kick.current = () => {
        if (raf.current) return; // already animating; next frame picks it up
        last = Date.now();
        raf.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      // No GL on this device/browser — the grid backdrop still shows.
    }
  };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} importantForAccessibility="no-hide-descendants">
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

"use client"

import { useEffect, useRef } from "react"

interface LgStlViewerProps {
  stlUrl: string
  height?: number
}

export function LgStlViewer({ stlUrl, height = 300 }: LgStlViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#111827;overflow:hidden}
  canvas{display:block;width:100%!important;height:100%!important}
  #info{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
    color:#94a3b8;font:11px/1.4 sans-serif;pointer-events:none;
    background:rgba(0,0,0,.5);padding:3px 8px;border-radius:4px}
</style></head><body>
<div id="info">Left-drag: rotate · Scroll: zoom · Right-drag: pan</div>
<script type="importmap">
{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
}}</script>
<script type="module">
import*as THREE from'three';
import{STLLoader}from'three/addons/loaders/STLLoader.js';
import{OrbitControls}from'three/addons/controls/OrbitControls.js';

const r=new THREE.WebGLRenderer({antialias:true});
r.setPixelRatio(window.devicePixelRatio);
r.setSize(window.innerWidth,window.innerHeight);
document.body.appendChild(r.domElement);

const s=new THREE.Scene();
s.background=new THREE.Color(0x111827);
s.add(new THREE.AmbientLight(0xffffff,0.45));
const sun=new THREE.DirectionalLight(0xfff5e0,1.2);
sun.position.set(200,200,400);s.add(sun);
s.add(new THREE.DirectionalLight(0x6080ff,0.35).translateX(-200));

const cam=new THREE.PerspectiveCamera(45,window.innerWidth/window.innerHeight,0.1,5000);
const ctrl=new OrbitControls(cam,r.domElement);
ctrl.enableDamping=true;

fetch("${stlUrl}",{credentials:'include'}).then(r=>r.arrayBuffer()).then(buf=>{
  const geo=new STLLoader().parse(buf);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb=geo.boundingBox;
  const cx=(bb.min.x+bb.max.x)/2,cy=(bb.min.y+bb.max.y)/2;
  geo.translate(-cx,-cy,-bb.min.z);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x1d4ed8,roughness:0.35,metalness:0.15}));
  s.add(mesh);
  const sz=bb.getSize(new THREE.Vector3()).length();
  cam.position.set(sz*0.8,-sz*0.8,sz*0.6);
  ctrl.target.set(0,0,(bb.max.z-bb.min.z)*0.4);
  ctrl.update();
});

function animate(){requestAnimationFrame(animate);ctrl.update();r.render(s,cam)}
animate();
window.addEventListener('resize',()=>{
  cam.aspect=window.innerWidth/window.innerHeight;
  cam.updateProjectionMatrix();
  r.setSize(window.innerWidth,window.innerHeight);
});
</script></body></html>`

  useEffect(() => {
    if (iframeRef.current) iframeRef.current.srcdoc = html
  }, [html])

  return (
    <iframe
      ref={iframeRef}
      className="w-full rounded-lg border"
      style={{ height }}
      sandbox="allow-scripts allow-same-origin"
    />
  )
}

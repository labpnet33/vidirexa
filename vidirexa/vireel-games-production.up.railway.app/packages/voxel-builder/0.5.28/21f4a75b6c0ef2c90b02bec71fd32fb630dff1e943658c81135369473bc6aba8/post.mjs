import*as a from"./vendor/three.custom.min.mjs";export const POST=Object.freeze({near:.5,far:120,aoTaps:12,saturation:1.12,aoStrength:.7,bloomStrength:.08});export function createPost(t,n){const l=new a.WebGLRenderTarget(1080,1920),o=new a.WebGLRenderTarget(540,960);l.samples=4,o.texture.minFilter=o.texture.magFilter=a.NearestFilter;const f=new a.MeshDepthMaterial({depthPacking:a.RGBADepthPacking}),i={sceneColor:{value:l.texture},sceneDepth:{value:o.texture},pixel:{value:{x:1/1080,y:1/1920}},nearClip:{value:POST.near},farClip:{value:POST.far},aoStrength:{value:POST.aoStrength},saturation:{value:POST.saturation},bloomStrength:{value:POST.bloomStrength}},c=new a.MeshBasicMaterial({depthTest:!1,depthWrite:!1});c.onBeforeCompile=e=>{Object.assign(e.uniforms,i),e.vertexShader="varying vec2 screenUv;void main(){screenUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",e.fragmentShader=`
  varying vec2 screenUv;
  uniform sampler2D sceneColor,sceneDepth;
  uniform vec2 pixel;
  uniform float nearClip,farClip,aoStrength,saturation,bloomStrength;
  #include <packing>
  float distanceAt(vec2 uv){float d=unpackRGBAToDepth(texture2D(sceneDepth,uv));return nearClip*farClip/(farClip-(farClip-nearClip)*d);}
  void main(){
   vec3 c=texture2D(sceneColor,screenUv).rgb;
   float z=distanceAt(screenUv),occ=0.0;
   vec2 slope=clamp(vec2(dFdx(z)/pixel.x,dFdy(z)/pixel.y),vec2(-150.0),vec2(150.0));
   float bias=.045+max(abs(dFdx(z)),abs(dFdy(z)))*1.5;
   for(int i=0;i<12;i++){
    float angle=float(i)*2.39996323;
    vec2 delta=vec2(cos(angle),sin(angle))*pixel*(4.0+float(i%3)*5.0);
    float sampleZ=distanceAt(screenUv+delta),diff=z+dot(slope,delta)-sampleZ;
    occ+=smoothstep(bias,bias+.18,diff)*(1.0-smoothstep(.45,1.8,abs(diff)));
   }
   c*=1.0-aoStrength*occ/12.0;
   vec3 glow=vec3(0.0);
   for(int i=0;i<8;i++){float a=float(i)*.78539816;vec3 s=texture2D(sceneColor,screenUv+vec2(cos(a),sin(a))*pixel*9.0).rgb;glow+=max(s-vec3(.82),vec3(0.0));}
   c+=glow*bloomStrength;
   c*=1.08;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.0,1.0);
   float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);
   c=(c-.5)*1.035+.5;
   vec2 v=screenUv*2.0-1.0;c*=1.0-.07*dot(v,v);
   gl_FragColor=vec4(pow(max(c,vec3(0.0)),vec3(1.0/2.2)),1.0);
  }`};const p=new a.Scene,v=new a.PlaneGeometry(2,2),d=new a.Mesh(v,c);d.frustumCulled=!1,p.add(d);const m=new a.Color("#ffffff");let u=!1;return{uniforms:i,render(e,s=[]){t.setRenderTarget(l),t.render(e,n);const g={colorCalls:t.info.render.calls,colorTriangles:t.info.render.triangles},h=e.background,x=e.overrideMaterial,b=t.shadowMap.enabled;e.background=m,e.overrideMaterial=f,t.shadowMap.enabled=!1;for(const r of s)r.visible=!1;t.setRenderTarget(o),t.render(e,n),g.depthCalls=t.info.render.calls;for(const r of s)r.visible=!0;return e.background=h,e.overrideMaterial=x,t.shadowMap.enabled=b,t.setRenderTarget(null),t.render(p,n),{...g,postCalls:t.info.render.calls}},resize(e,s){l.setSize(e,s),o.setSize(Math.ceil(e/2),Math.ceil(s/2)),i.pixel.value.x=1/e,i.pixel.value.y=1/s},dispose(){u||(u=!0,l.dispose(),o.dispose(),f.dispose(),c.dispose(),v.dispose())}}}

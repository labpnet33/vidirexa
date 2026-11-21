const he=1536,Ae=16,k=`
float S(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
uint pcg(uint v){uint s=v*747796405u+2891336453u;uint w=((s>>((s>>28u)+4u))^s)*277803737u;return (w>>22u)^w;}
float h21(vec2 p){ivec2 i=ivec2(floor(p));return float(pcg(uint(i.x)*1664525u+pcg(uint(i.y)+374761393u))>>8u)/16777216.;}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
`,q=`
uniform vec3 uSkyTop,uSkyMid,uSkyLow,uBoxCol;uniform vec4 uBoxA,uBoxB;
vec3 env(vec3 d){
  float t=d.y;vec3 c=t>0.?mix(uSkyMid,uSkyTop,pow(t,.55)):mix(uSkyMid,uSkyLow,pow(-t,.45));
  vec3 a=normalize(uBoxA.xyz);float da=dot(d,a);
  if(da>.2){vec3 ta=normalize(cross(a,vec3(0.,1.,.01))),ba=cross(ta,a);vec2 q=vec2(dot(d,ta),dot(d,ba))/da;
    float win=S(.46,.40,abs(q.x))*S(.62,.56,abs(q.y));
    float bars=S(.015,.04,abs(q.x))*S(.015,.04,abs(q.y));c+=uBoxCol*uBoxA.w*win*bars;}
  vec3 b=normalize(uBoxB.xyz);float db=dot(d,b);
  if(db>.2){vec3 tb=normalize(cross(b,vec3(0.,1.,.01))),bb=cross(tb,b);vec2 q=vec2(dot(d,tb),dot(d,bb))/db;
    c+=uBoxCol*uBoxB.w*S(.20,.14,abs(q.x))*S(1.1,.9,abs(q.y));}
  return c;}
`,G=`
uniform float uTime,uPulse,uFlash;uniform vec3 uFlashCol,uTintA,uTintB,uBgTop,uBgMid,uBgLow;
vec3 backdrop(vec3 d){
  float t=d.y;vec2 sp=vec2(atan(d.x,-d.z),asin(clamp(d.y,-1.,1.)));
  vec3 c=t>0.?mix(uBgMid,uBgTop,pow(t,.7)):mix(uBgMid,uBgLow,pow(-t,.6));
#if SCENE==0
  { // studio: a soft pool of light behind the towers, slow dust
    float g=exp(-dot(sp*vec2(.9,1.5)-vec2(0.,-.05),sp*vec2(.9,1.5)-vec2(0.,-.05))*1.4);c+=vec3(.105,.125,.155)*g*(1.+.25*uPulse);
    vec2 q=sp*9.+vec2(uTime*.02,uTime*.035);vec2 cell=floor(q);vec2 f=fract(q)-.5;float r=h21(cell);
    vec2 o=vec2(h21(cell+3.1),h21(cell+7.7))-.5;float m=S(.09,.0,length(f-o*.6))*step(.72,r);c+=vec3(.16,.19,.23)*m*(.5+.5*sin(uTime*1.3+r*40.));
  }
#elif SCENE==1
  { // grid void: violet horizon glow, slow light bars
    float hz=exp(-abs(t)*7.);c+=mix(uTintA,uTintB,.5+.5*sin(sp.x*1.5+uTime*.2))*hz*(.34+.5*uPulse);
    float bar=S(.985,1.,sin(sp.x*14.+uTime*.35))*S(.0,.5,t)*S(1.2,.3,t);c+=vec3(.25,.12,.45)*bar*.5;
    vec2 q=sp*30.;float r=h21(floor(q));c+=vec3(.8,.7,1.)*step(.985,r)*S(.2,.0,length(fract(q)-.5))*step(.02,t);
  }
#elif SCENE==2
  { // sunset: sun low behind the towers, drifting haze bands
    vec2 s=sp-vec2(.35,.06);float sun=exp(-dot(s,s)*28.);c+=vec3(1.,.62,.28)*sun*1.1+vec3(1.,.4,.25)*exp(-dot(s,s)*3.)*.35;
    float band=fbm(vec2(sp.x*2.+uTime*.03,sp.y*14.));c=mix(c,c*1.25+vec3(.08,.02,.05),S(.45,.8,band)*S(.5,.0,abs(t-.12)));
    c+=vec3(.2,.07,.1)*uPulse*exp(-abs(t)*5.);
  }
#elif SCENE==3
  { // day: bright sky, slow clouds
    float cl=fbm(vec2(sp.x*2.2+uTime*.025,sp.y*5.-uTime*.01));c=mix(c,vec3(1.),S(.5,.85,cl)*S(-.05,.25,t)*.75);
    c+=vec3(.05)*uPulse;
  }
#elif SCENE==4
  { // space: stars that twinkle, nebula in the tower colours
    vec2 q=sp*42.;vec2 cell=floor(q);float r=h21(cell);vec2 o=vec2(h21(cell+1.7),h21(cell+9.2))-.5;
    float st=S(.16,.0,length(fract(q)-.5-o*.7))*step(.90,r);c+=vec3(.9,.95,1.)*st*(.45+.55*sin(uTime*(1.+r*3.)+r*60.));
    float nb=fbm(sp*1.6+vec2(uTime*.012,0.));float nb2=fbm(sp*2.3+vec2(9.,uTime*.01));
    c+=uTintA*.20*S(.45,.9,nb)+uTintB*.20*S(.5,.95,nb2);c+=(uTintA+uTintB)*.06*uPulse;
  }
#else
  { // aurora: curtains of light that wave
    float x=sp.x*2.2;float w=sin(x*1.7+uTime*.22)+.6*sin(x*3.9-uTime*.31)+.3*sin(x*8.3+uTime*.5);
    float cur=S(.0,.9,t)*S(1.3,.25,t)*(.5+.5*sin(w*1.6+t*5.));
    float rays=.6+.4*vnoise(vec2(x*9.+w,uTime*.4));c+=mix(vec3(.1,.95,.6),mix(uTintA,uTintB,.5+.5*sin(x)),.45)*cur*rays*(.36+.3*uPulse);
    vec2 q=sp*36.;float r=h21(floor(q));c+=vec3(.8,.9,1.)*step(.975,r)*S(.2,.0,length(fract(q)-.5))*step(.05,t)*.7;
  }
#endif
  return c+uFlashCol*uFlash*(.10+.22*exp(-abs(t)*3.));}
`,$=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;
layout(location=2) in vec4 i0;layout(location=3) in vec4 i1;layout(location=4) in vec4 i2;layout(location=5) in vec4 i3;
uniform mat4 uVP,uLightVP;
out vec3 vPos,vNor,vLocal,vScale;out vec4 vCol;out vec2 vAE;out vec4 vShadow;
vec3 rot(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){vec3 s=i1.xyz;vLocal=aPos;vScale=s;vec3 p=rot(i2,aPos*s)+i0.xyz;vPos=p;vNor=rot(i2,aNor/s);vCol=i3;vAE=vec2(i0.w,i1.w);vShadow=uLightVP*vec4(p,1.);gl_Position=uVP*vec4(p,1.);}
`,Q=`#version 300 es
precision highp float;precision highp sampler2DShadow;precision highp int;
in vec3 vPos,vNor,vLocal,vScale;in vec4 vCol;in vec2 vAE;in vec4 vShadow;
uniform vec3 uEye,uLightDir,uLightCol,uAmbSky,uAmbGround,uFog;uniform float uFogK,uShadowOn,uClipY;
uniform sampler2DShadow uShadowMap;
uniform float uDiff,uWrap,uSpec,uShine,uEnvK,uMetal,uF0,uRefr,uEmis,uAlpha,uEdge,uEdgeW,uRim,uWhite,uRound,uFresA;
float S(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
${q}
out vec4 o;
float shadow(){vec3 c=vShadow.xyz/vShadow.w*.5+.5;if(c.x<=0.||c.x>=1.||c.y<=0.||c.y>=1.||c.z>=1.)return 1.;float s=0.;float t=1.25/1536.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)s+=texture(uShadowMap,vec3(c.xy+vec2(float(x),float(y))*t,c.z-.0022));return s/9.;}
void main(){
  if(vPos.y<uClipY)discard;
  vec3 N=normalize(vNor);vec3 V=normalize(uEye-vPos);if(!gl_FrontFacing)N=-N;
  float ndv=max(dot(N,V),0.),ndl=dot(N,uLightDir);
  float sh=uShadowOn>.5?shadow():1.;
  float dif=mix(max(ndl,0.),(ndl*.5+.5)*(ndl*.5+.5),uWrap)*mix(1.,sh,.8);
  vec3 amb=mix(uAmbGround,uAmbSky,N.y*.5+.5)*mix(1.,sh,.25);
  vec3 base=mix(vCol.rgb,vec3(1.),uWhite);
  float fres=uF0+(1.-uF0)*pow(1.-ndv,5.);
  vec3 col=base*(amb+uLightCol*dif)*uDiff;
  if(uEnvK>0.)col+=env(reflect(-V,N))*mix(vec3(1.),base,uMetal)*uEnvK*mix(fres,1.,uMetal);
  vec3 Hh=normalize(uLightDir+V);col+=uLightCol*pow(max(dot(N,Hh),0.),uShine)*uSpec*sh;
  if(uRefr>0.){vec3 T=refract(-V,N,.74);col+=env(T)*mix(vec3(1.),base,.9)*uRefr*(1.-fres)+base*(.10+.30*pow(ndv,2.))*uRefr;}
  col+=base*(uEmis+vAE.y);
  col+=mix(base,vec3(1.),.35)*uRim*pow(1.-ndv,2.5);
  float alpha=vAE.x*uAlpha;
  if(uEdge>0.){
    vec3 d=(.5-abs(vLocal))*vScale;
    if(uRound>.5){d.x=(.5-length(vLocal.xz))*vScale.x;d.z=1e3;}
    float lo=min(d.x,min(d.y,d.z)),hi=max(d.x,max(d.y,d.z)),mid=d.x+d.y+d.z-lo-hi;
    float e=S(uEdgeW,uEdgeW*.25,mid);col+=mix(base,vec3(1.),.45)*e*uEdge;alpha=mix(alpha,1.,e*.55*step(.001,1.-uAlpha));
  }
  alpha=mix(alpha,1.,fres*uFresA);
  float f=1.-exp(-uFogK*length(uEye-vPos));col=mix(col,uFog,f);
  o=vec4(col,alpha);}
`,j=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=2) in vec4 i0;layout(location=3) in vec4 i1;layout(location=4) in vec4 i2;
uniform mat4 uVP;
vec3 rot(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){gl_Position=uVP*vec4(rot(i2,aPos*i1.xyz)+i0.xyz,1.);}
`,J=`#version 300 es
precision mediump float;void main(){}
`,Z=`#version 300 es
layout(location=0) in vec3 aPos;uniform mat4 uVP,uLightVP;uniform vec3 uEye;out vec3 vPos;out vec4 vShadow;
void main(){vec3 p=vec3(aPos.x*90.+uEye.x,0.,aPos.z*90.+uEye.z);vPos=p;vShadow=uLightVP*vec4(p,1.);gl_Position=uVP*vec4(p,1.);}
`,ee=o=>`#version 300 es
#define SCENE ${o}
precision highp float;precision highp sampler2DShadow;precision highp int;
in vec3 vPos;in vec4 vShadow;
uniform vec3 uEye,uFloorCol,uGridCol;uniform vec2 uRes;uniform float uReflK,uGrid,uShadowK,uFloorF0,uFar,uSpot,uBlur;
uniform sampler2D uRefl;uniform sampler2DShadow uShadowMap;
${k}${q}${G}
out vec4 o;
float shadow(){vec3 c=vShadow.xyz/vShadow.w*.5+.5;if(c.x<=0.||c.x>=1.||c.y<=0.||c.y>=1.||c.z>=1.)return 1.;float s=0.;float t=3./1536.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)s+=texture(uShadowMap,vec3(c.xy+vec2(float(x),float(y))*t,c.z-.002));return s/9.;}
void main(){
  vec3 toP=vPos-uEye;float dist=length(toP);vec3 D=toP/dist;vec3 V=-D;
  float fres=uFloorF0+(1.-uFloorF0)*pow(1.-max(V.y,0.),5.);
  vec2 uv=gl_FragCoord.xy/uRes;
  vec4 r=vec4(0.);float wsum=0.;vec2 px=uBlur/uRes;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){float w=1./(1.+float(x*x+y*y));r+=texture(uRefl,uv+vec2(float(x),float(y)*1.6)*px*1.7)*w;wsum+=w;}
  r/=wsum;
  vec3 Rd=vec3(D.x,-D.y,D.z);vec3 bd=backdrop(Rd);vec3 mirror=mix(bd,r.rgb/max(r.a,.001),clamp(r.a,0.,1.));
  vec3 base=uFloorCol;
  float sp=exp(-dot(vPos.xz,vPos.xz)*.035);base*=mix(1.,.55+1.1*sp,uSpot);
  if(uGrid>0.){vec2 g=abs(fract(vPos.xz*.5+.5)-.5)*2.;vec2 fw=fwidth(vPos.xz*.5)*2.;float line=max(S(fw.x*1.6+.035,.0,g.x),S(fw.y*1.6+.035,.0,g.y));
    float fade=exp(-dist*.045);base+=uGridCol*line*fade*uGrid*(.55+1.3*uPulse);}
  float sh=mix(1.,shadow(),uShadowK);
  vec3 col=base*sh+mirror*uReflK*fres*mix(1.,sh,.35);
  col+=uFlashCol*uFlash*.12*sp;
  float far=S(uFar*.25,uFar,dist);col=mix(col,bd,far);
  o=vec4(col,1.);}
`,te=`#version 300 es
layout(location=0) in vec3 aPos;uniform mat4 uInvVP;out vec3 vDir;
void main(){vec4 a=uInvVP*vec4(aPos.xy,-1.,1.),b=uInvVP*vec4(aPos.xy,1.,1.);vDir=b.xyz/b.w-a.xyz/a.w;gl_Position=vec4(aPos.xy,1.,1.);}
`,oe=o=>`#version 300 es
#define SCENE ${o}
precision highp float;precision highp int;in vec3 vDir;
${k}${G}
out vec4 o;void main(){o=vec4(backdrop(normalize(vDir)),1.);}
`,re=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=2) in vec4 i0;layout(location=3) in vec4 i1;layout(location=4) in vec4 i2;layout(location=5) in vec4 i3;
uniform mat4 uVP;uniform vec3 uCamR,uCamU;
out vec2 vUv;out vec4 vCol;out vec4 vPar;
void main(){float m=i2.x;vec2 q=aPos.xz*2.;vUv=q;vCol=i3;vPar=i2;vec3 p;
  if(m<.5||m>2.5){vec3 r=uCamR,u=uCamU;if(m>2.5){vec3 v=i1.xyz;float l=length(v);vec3 dir=l>1e-4?v/l:u;r=normalize(cross(dir,cross(uCamR,uCamU)));u=dir*(1.+i2.z);}p=i0.xyz+(r*q.x+u*q.y)*i0.w;}
  else p=i0.xyz+vec3(q.x,0.,q.y)*i0.w;
  gl_Position=uVP*vec4(p,1.);}
`,ae=`#version 300 es
precision highp float;in vec2 vUv;in vec4 vCol;in vec4 vPar;out vec4 o;
float S(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
void main(){float d=length(vUv),a=0.;
  if(vPar.x<.5){a=S(1.,0.,d);a*=a;}
  else if(vPar.x<1.5){float w=vPar.y;a=S(w,0.,abs(d-(1.-w)))*step(d,1.);}
  else if(vPar.x<2.5){a=S(1.,0.,d);a*=a;}
  else{a=S(1.,.2,abs(vUv.x))*S(1.,0.,abs(vUv.y));}
  o=vec4(vCol.rgb*vCol.a*a,0.);}
`,ie=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=2) in vec4 i0;layout(location=3) in vec4 i1;layout(location=4) in vec4 i2;layout(location=5) in vec4 i3;
uniform mat4 uVP;uniform vec3 uEye;out vec2 vUv;out vec4 vCol;out vec3 vPos;
void main(){vec2 t=aPos.xz+.5;vec3 p=i0.xyz+i1.xyz*t.x+i2.xyz*t.y;vPos=p;vUv=vec2(mix(i3.x,i3.z,t.x),mix(i3.w,i3.y,t.y));
  float c=i0.w;vCol=vec4(mod(c,256.)/255.,mod(floor(c/256.),256.)/255.,floor(c/65536.)/255.,i1.w);vec4 q=uVP*vec4(p,1.);
  if(i2.w>0.){vec4 n=uVP*vec4(p+normalize(uEye-p)*i2.w,1.);q.z=n.z*q.w/n.w;}gl_Position=q;}
`,ue=`#version 300 es
precision highp float;in vec2 vUv;in vec4 vCol;in vec3 vPos;uniform sampler2D uTex;uniform float uClipY;out vec4 o;
void main(){if(vPos.y<uClipY)discard;float a=texture(uTex,vUv).r*vCol.a;if(a<.004)discard;o=vec4(vCol.rgb,a);}
`,z=`#version 300 es
layout(location=0) in vec3 aPos;out vec2 vUv;void main(){vUv=aPos.xy*.5+.5;gl_Position=vec4(aPos.xy,0.,1.);}
`,ne=`#version 300 es
precision highp float;in vec2 vUv;uniform sampler2D uTex;uniform vec2 uPx;uniform float uThr;out vec4 o;
void main(){vec3 c=vec3(0.);for(int y=0;y<2;y++)for(int x=0;x<2;x++)c+=texture(uTex,vUv+(vec2(float(x),float(y))*2.-1.)*uPx).rgb;c*=.25;
  float l=max(c.r,max(c.g,c.b));float k=max(l-uThr,0.)/max(l,1e-4);o=vec4(c*k,1.);}
`,se=`#version 300 es
precision highp float;in vec2 vUv;uniform sampler2D uTex;uniform vec2 uDir;out vec4 o;
void main(){vec3 c=texture(uTex,vUv).rgb*.227027;
  c+=(texture(uTex,vUv+uDir*1.3846).rgb+texture(uTex,vUv-uDir*1.3846).rgb)*.316216;
  c+=(texture(uTex,vUv+uDir*3.2308).rgb+texture(uTex,vUv-uDir*3.2308).rgb)*.070270;o=vec4(c,1.);}
`,ce=`#version 300 es
precision highp float;in vec2 vUv;uniform sampler2D uTex,uBloomA,uBloomB;uniform float uBloom,uVig,uGain,uSat;uniform vec3 uLift;out vec4 o;
void main(){vec3 c=texture(uTex,vUv).rgb;vec3 b=texture(uBloomA,vUv).rgb*.6+texture(uBloomB,vUv).rgb*.9;c+=b*uBloom;
  vec2 q=vUv-.5;c*=1.-uVig*dot(q,q)*1.6;c=c*uGain+uLift*(1.-c);float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);
  c=c/(1.+max(c-.82,0.)*1.4);o=vec4(c,1.);}
`;function le(){const o=[],t=[],a=[],n=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];for(const e of n){const r=e[0]?[0,1,0]:[1,0,0],s=[e[1]*r[2]-e[2]*r[1],e[2]*r[0]-e[0]*r[2],e[0]*r[1]-e[1]*r[0]],i=o.length/3;for(const[l,E]of[[-1,-1],[1,-1],[1,1],[-1,1]])o.push((e[0]+r[0]*l+s[0]*E)*.5,(e[1]+r[1]*l+s[1]*E)*.5,(e[2]+r[2]*l+s[2]*E)*.5),t.push(e[0],e[1],e[2]);a.push(i,i+1,i+2,i,i+2,i+3)}return{p:o,n:t,idx:a}}function X(o){const t=(1+Math.sqrt(5))/2;let a=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]],n=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];const e=i=>{const l=Math.hypot(i[0],i[1],i[2]);return[i[0]/l,i[1]/l,i[2]/l]};a=a.map(e);for(let i=0;i<o;i++){const l=new Map,E=(d,f)=>{const b=d<f?d*1e5+f:f*1e5+d;let T=l.get(b);return T===void 0&&(T=a.length,a.push(e([(a[d][0]+a[f][0])/2,(a[d][1]+a[f][1])/2,(a[d][2]+a[f][2])/2])),l.set(b,T)),T},p=[];for(const[d,f,b]of n){const T=E(d,f),A=E(f,b),F=E(b,d);p.push([d,T,F],[f,A,T],[b,F,A],[T,A,F])}n=p}const r=[],s=[];for(const i of a)r.push(i[0]*.5,i[1]*.5,i[2]*.5),s.push(i[0],i[1],i[2]);return{p:r,n:s,idx:n.flat()}}function H(o,t){const a=[],n=[],e=[];for(let r=0;r<=o;r++){const s=r/o*Math.PI*2,i=Math.cos(s),l=Math.sin(s);a.push(i*.5,-.5,l*.5,i*.5,.5,l*.5),n.push(i,0,l,i,0,l)}for(let r=0;r<o;r++){const s=r*2;e.push(s,s+1,s+3,s,s+3,s+2)}if(t)for(const r of[-1,1]){const s=a.length/3;a.push(0,r*.5,0),n.push(0,r,0);for(let i=0;i<=o;i++){const l=i/o*Math.PI*2;a.push(Math.cos(l)*.5,r*.5,Math.sin(l)*.5),n.push(0,r,0)}for(let i=0;i<o;i++)r>0?e.push(s,s+2+i,s+1+i):e.push(s,s+1+i,s+2+i)}return{p:a,n,idx:e}}function fe(){const o=[[0,.5,0],[.5,0,0],[0,0,.5],[-.5,0,0],[0,0,-.5],[0,-.5,0]],t=[[0,2,1],[0,3,2],[0,4,3],[0,1,4],[5,1,2],[5,2,3],[5,3,4],[5,4,1]],a=[],n=[],e=[];for(const[r,s,i]of t){const l=o[r],E=o[s],p=o[i],d=E[0]-l[0],f=E[1]-l[1],b=E[2]-l[2],T=p[0]-l[0],A=p[1]-l[1],F=p[2]-l[2];let M=f*F-b*A,g=b*T-d*F,U=d*A-f*T;const D=Math.hypot(M,g,U);M/=D,g/=D,U/=D;const N=a.length/3;for(const B of[l,E,p])a.push(B[0],B[1],B[2]),n.push(M,g,U);e.push(N,N+1,N+2)}return{p:a,n,idx:e}}const ve=()=>({p:[-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5],n:[0,1,0,0,1,0,0,1,0,0,1,0],idx:[0,2,1,0,3,2]}),Ee=()=>({p:[-1,-1,0,3,-1,0,-1,3,0],n:[0,0,1,0,0,1,0,0,1],idx:[0,1,2]}),de={alpha:!1,depth:!1,stencil:!1,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance",failIfMajorPerformanceCaveat:!1},C={created:0,released:0,lost:0,failed:0};let h=null,_="",O=0;function y(o,t,a,n){const e=(l,E)=>{const p=o.createShader(l);return o.shaderSource(p,E),o.compileShader(p),p},r=e(o.VERTEX_SHADER,t),s=e(o.FRAGMENT_SHADER,a),i=o.createProgram();return o.attachShader(i,r),o.attachShader(i,s),o.linkProgram(i),{p:i,v:r,f:s,name:n,u:null}}function V(o,t){if(t.u)return t;if(!o.getProgramParameter(t.p,o.LINK_STATUS)&&!o.isContextLost())throw new Error(`Shader ${t.name}: ${o.getProgramInfoLog(t.p)||""} ${o.getShaderInfoLog(t.v)||""} ${o.getShaderInfoLog(t.f)||""}`.slice(0,900));o.deleteShader(t.v),o.deleteShader(t.f);const a={},n=o.getProgramParameter(t.p,o.ACTIVE_UNIFORMS)||0;for(let e=0;e<n;e++){const r=o.getActiveUniform(t.p,e);r&&(a[r.name.replace(/\[0\]$/,"")]=o.getUniformLocation(t.p,r.name))}return t.u=a,t}const W=["mesh","depth","fx","text","bright","blur","post"];function K(o,t){o.prog["sky"+t]||(o.prog["sky"+t]=y(o.gl,te,oe(t),"sky"+t),o.prog["floor"+t]=y(o.gl,Z,ee(t),"floor"+t))}function xe(){if(typeof document>"u")return null;const o=document.createElement("canvas");o.width=o.height=2;let t=null;try{t=o.getContext("webgl2",de)}catch(n){_=n.message}if(!t||t.isContextLost())return _=_||"This browser could not start WebGL2.",null;const a={canvas:o,gl:t,users:0,dead:!1,targets:new Map,atlases:new Map,meshes:{},prog:{},inst:t.createBuffer(),instBytes:0,shadow:null,samples:Math.min(4,t.getParameter(t.MAX_SAMPLES)||0),name:""};try{a.parallel=t.getExtension("KHR_parallel_shader_compile"),a.prog.mesh=y(t,$,Q,"mesh"),a.prog.depth=y(t,j,J,"depth"),a.prog.fx=y(t,re,ae,"fx"),a.prog.text=y(t,ie,ue,"text"),a.prog.bright=y(t,z,ne,"bright"),a.prog.blur=y(t,z,se,"blur"),a.prog.post=y(t,z,ce,"post");const n=(s,i)=>{const l=t.createVertexArray();t.bindVertexArray(l);const E=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,E);const p=new Float32Array(i.p.length*2);for(let f=0;f<i.p.length/3;f++)p.set(i.p.slice(f*3,f*3+3),f*6),p.set(i.n.slice(f*3,f*3+3),f*6+3);t.bufferData(t.ARRAY_BUFFER,p,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,24,0),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,24,12);const d=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,d),t.bufferData(t.ELEMENT_ARRAY_BUFFER,new Uint16Array(i.idx),t.STATIC_DRAW),t.bindBuffer(t.ARRAY_BUFFER,a.inst);for(let f=2;f<=5;f++)t.enableVertexAttribArray(f),t.vertexAttribPointer(f,4,t.FLOAT,!1,64,(f-2)*16),t.vertexAttribDivisor(f,1);t.bindVertexArray(null),a.meshes[s]={vao:l,count:i.idx.length}};n("cube",le()),n("sphere",X(2)),n("sphereLo",X(1)),n("sphereHi",X(3)),n("cyl",H(40,!0)),n("tube",H(48,!1)),n("gem",fe()),n("quad",ve()),n("screen",Ee());const e=t.createTexture();t.bindTexture(t.TEXTURE_2D,e),t.texStorage2D(t.TEXTURE_2D,1,t.DEPTH_COMPONENT24,1536,1536),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_COMPARE_MODE,t.COMPARE_REF_TO_TEXTURE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_COMPARE_FUNC,t.LEQUAL);const r=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,r),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,e,0),t.drawBuffers([t.NONE]),t.readBuffer(t.NONE),a.shadow={tex:e,fbo:r},t.bindFramebuffer(t.FRAMEBUFFER,null);try{const s=t.getExtension("WEBGL_debug_renderer_info");a.name=String(s?t.getParameter(s.UNMASKED_RENDERER_WEBGL):t.getParameter(t.RENDERER))}catch{}}catch(n){_=n.message;try{t.getExtension("WEBGL_lose_context")?.loseContext()}catch{}return null}return o.addEventListener("webglcontextlost",n=>{n.preventDefault(),!a.dead&&(a.dead=!0,C.lost++,h===a&&(h=null),O=performance.now()+800)}),C.created++,_="",a}function L(o,t,a,n){const e=o.createTexture();o.bindTexture(o.TEXTURE_2D,e),o.texStorage2D(o.TEXTURE_2D,1,o.RGBA8,t,a),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,n),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,n),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const r=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,r),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,e,0),{tex:e,fbo:r,w:t,h:a}}function me(o,t,a){const n=t+"x"+a;let e=o.targets.get(n);if(e)return e.used=performance.now(),e;const r=o.gl;if(o.targets.size>=2){let f=null,b="";for(const[T,A]of o.targets)(!f||A.used<f.used)&&(f=A,b=T);pe(r,f),o.targets.delete(b)}e={used:performance.now(),w:t,h:a},e.msaa=r.createFramebuffer(),r.bindFramebuffer(r.FRAMEBUFFER,e.msaa),e.rbColor=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,e.rbColor),r.renderbufferStorageMultisample(r.RENDERBUFFER,o.samples,r.RGBA8,t,a),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,e.rbColor),e.rbDepth=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,e.rbDepth),r.renderbufferStorageMultisample(r.RENDERBUFFER,o.samples,r.DEPTH_COMPONENT24,t,a),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,e.rbDepth),e.scene=L(r,t,a,r.LINEAR);const s=Math.max(2,t>>1),i=Math.max(2,a>>1);e.refl=L(r,s,i,r.LINEAR),e.reflDepth=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,e.reflDepth),r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_COMPONENT24,s,i),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,e.reflDepth);const l=Math.max(2,t>>2),E=Math.max(2,a>>2),p=Math.max(2,t>>3),d=Math.max(2,a>>3);return e.bA=L(r,l,E,r.LINEAR),e.bB=L(r,l,E,r.LINEAR),e.cA=L(r,p,d,r.LINEAR),e.cB=L(r,p,d,r.LINEAR),r.bindFramebuffer(r.FRAMEBUFFER,null),o.targets.set(n,e),e}function pe(o,t){for(const a of["scene","refl","bA","bB","cA","cB"])o.deleteTexture(t[a].tex),o.deleteFramebuffer(t[a].fbo);o.deleteFramebuffer(t.msaa),o.deleteRenderbuffer(t.rbColor),o.deleteRenderbuffer(t.rbDepth),o.deleteRenderbuffer(t.reflDepth)}function Te(o,t){const a=o.gl;let n=o.atlases.get(t);return n||(n=a.createTexture(),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n),a.pixelStorei(a.UNPACK_ALIGNMENT,1),a.pixelStorei(a.UNPACK_FLIP_Y_WEBGL,!1),a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),a.texImage2D(a.TEXTURE_2D,0,a.R8,t.w,t.h,0,a.RED,a.UNSIGNED_BYTE,t.bytes),a.generateMipmap(a.TEXTURE_2D),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.LINEAR_MIPMAP_LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),o.atlases.set(t,n),n)}export function dropAtlas(o,t){if(!o||!t)return;const a=o.atlases.get(t);a&&(o.atlases.delete(t),o.dead||o.gl.deleteTexture(a))}const Y=()=>{if(!h){if(performance.now()<O)return null;if(h=xe(),!h)return C.failed++,O=performance.now()+1500,null}return h};export function acquire(){const o=Y();return o&&o.users++,o}export async function prepare(o=0){const t=Y();if(!t)return!1;const a=t.gl;try{K(t,o)}catch(s){return _=s.message,!1}const n=t.parallel;if(!n)return!0;const e=[...W,"sky"+o,"floor"+o],r=performance.now()+1e4;for(;;){if(t.dead||a.isContextLost())return!1;let s=!0;for(const i of e){const l=t.prog[i];if(l&&!l.u&&!a.getProgramParameter(l.p,n.COMPLETION_STATUS_KHR)){s=!1;break}}if(s||performance.now()>r)return!0;await new Promise(i=>setTimeout(i,8))}}export function release(o){if(o&&(o.users--,!(o.users>0||o.dead))){o.dead=!0,h===o&&(h=null),C.released++;try{o.gl.getExtension("WEBGL_lose_context")?.loseContext()}catch{}o.canvas.width=o.canvas.height=1}}export function gpuStats(){return{...C,live:h?1:0,users:h?.users??0,renderer:h?.name??"",error:_,targets:h?[...h.targets.keys()]:[]}}const x=(o,t,a)=>{t&&o.uniform3f(t,a[0],a[1],a[2])},m=(o,t,a)=>{t&&o.uniform1f(t,a)},be=["uDiff","uWrap","uSpec","uShine","uEnvK","uMetal","uF0","uRefr","uEmis","uAlpha","uEdge","uEdgeW","uRim","uWhite","uRound","uFresA"],Re={uDiff:1,uWrap:0,uSpec:.3,uShine:40,uEnvK:0,uMetal:0,uF0:.04,uRefr:0,uEmis:0,uAlpha:1,uEdge:0,uEdgeW:.03,uRim:0,uWhite:0,uRound:0,uFresA:0};export function drawFrame(o,t,a,n){const e=o.gl;if(o.dead||e.isContextLost())return!1;(o.canvas.width!==a||o.canvas.height!==n)&&(o.canvas.width=a,o.canvas.height=n);const r=t.look,s={};try{K(o,r.scene);for(const u of W)s[u]=V(e,o.prog[u]);s.sky=V(e,o.prog["sky"+r.scene]),s.floor=V(e,o.prog["floor"+r.scene])}catch(u){return _=u.message,o.dead=!0,h===o&&(h=null),C.failed++,O=performance.now()+5e3,!1}const i=me(o,a,n),l=[...t.opaque,...t.clear];let E=0;for(const u of l)u.offset=E*4,E+=u.count*16;const p=E*4;E+=t.fx.count*16;const d=t.text?.count&&t.text.atlas?t.text:null,f=E*4;d&&(E+=d.count*16);const b=d?Te(o,d.atlas):null;(!o.scratch||o.scratch.length<E)&&(o.scratch=new Float32Array(Math.max(E,4096)*2));let T=0;for(const u of l)o.scratch.set(u.data.subarray(0,u.count*16),T),T+=u.count*16;o.scratch.set(t.fx.data.subarray(0,t.fx.count*16),T),T+=t.fx.count*16,d&&o.scratch.set(d.data.subarray(0,d.count*16),T),e.bindBuffer(e.ARRAY_BUFFER,o.inst);const A=E*4;A>o.instBytes&&(o.instBytes=Math.max(A*2,65536),e.bufferData(e.ARRAY_BUFFER,o.instBytes,e.STREAM_DRAW)),e.bufferSubData(e.ARRAY_BUFFER,0,o.scratch,0,E);const F=(u,c)=>{if(!u.count)return;const S=o.meshes[u.mesh];e.bindVertexArray(S.vao),e.bindBuffer(e.ARRAY_BUFFER,o.inst);for(let R=2;R<=5;R++)e.vertexAttribPointer(R,4,e.FLOAT,!1,64,u.offset+(R-2)*16);e.drawElementsInstanced(e.TRIANGLES,S.count,e.UNSIGNED_SHORT,0,u.count)};e.disable(e.BLEND),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.depthMask(!0),e.enable(e.CULL_FACE),e.cullFace(e.BACK),e.frontFace(e.CCW),e.colorMask(!0,!0,!0,!0),e.bindFramebuffer(e.FRAMEBUFFER,o.shadow.fbo),e.viewport(0,0,1536,1536),e.clearDepth(1),e.clear(e.DEPTH_BUFFER_BIT),e.useProgram(s.depth.p),e.uniformMatrix4fv(s.depth.u.uVP,!1,t.light.vp),e.enable(e.POLYGON_OFFSET_FILL),e.polygonOffset(1.5,2);for(const u of l)u.cast&&F(u,!0);e.disable(e.POLYGON_OFFSET_FILL);const M=(u,c,S,R)=>{const I=s.mesh,v=I.u;return e.useProgram(I.p),e.uniformMatrix4fv(v.uVP,!1,u),e.uniformMatrix4fv(v.uLightVP,!1,t.light.vp),x(e,v.uEye,c),x(e,v.uLightDir,t.light.dir),x(e,v.uLightCol,t.light.color),x(e,v.uAmbSky,r.ambSky),x(e,v.uAmbGround,r.ambGround),x(e,v.uFog,r.fog),m(e,v.uFogK,r.fogK),m(e,v.uShadowOn,S),m(e,v.uClipY,R),x(e,v.uSkyTop,r.envTop),x(e,v.uSkyMid,r.envMid),x(e,v.uSkyLow,r.envLow),x(e,v.uBoxCol,r.boxCol),e.uniform4fv(v.uBoxA,r.boxA),e.uniform4fv(v.uBoxB,r.boxB),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,o.shadow.tex),e.uniform1i(v.uShadowMap,0),v},g=(u,c)=>{for(const S of be)m(e,u[S],c[S]??Re[S])},U=(u,c)=>{u.cull==="none"?e.disable(e.CULL_FACE):(e.enable(e.CULL_FACE),e.cullFace(u.cull==="front"!==c?e.FRONT:e.BACK))},D=u=>{m(e,u.uTime,t.time),m(e,u.uPulse,t.pulse),m(e,u.uFlash,t.flash),x(e,u.uFlashCol,t.flashCol),x(e,u.uTintA,r.tintA),x(e,u.uTintB,r.tintB),x(e,u.uBgTop,r.bgTop),x(e,u.uBgMid,r.bgMid),x(e,u.uBgLow,r.bgLow)},N=u=>{if(!t.fx.count)return;const c=s.fx;e.useProgram(c.p),e.uniformMatrix4fv(c.u.uVP,!1,u),x(e,c.u.uCamR,t.camR),x(e,c.u.uCamU,t.camU),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE),e.depthMask(!1),e.disable(e.CULL_FACE),F({mesh:"quad",count:t.fx.count,offset:p},!1),e.depthMask(!0),e.disable(e.BLEND),e.enable(e.CULL_FACE)},B=(u,c,S,R)=>{const I=M(u,c,S,R?.001:-1e6);for(const v of t.opaque)R&&v.mirror===!1||(g(I,v.mat),U(v,R),F(v,!1));e.enable(e.BLEND),e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);for(const v of t.clear)R&&v.mirror===!1||(g(I,v.mat),U(v,R),e.depthMask(v.depthWrite!==!1),F(v,!1));if(d&&b){const v=s.text;e.useProgram(v.p),e.uniformMatrix4fv(v.u.uVP,!1,u),m(e,v.u.uClipY,R?.001:-1e6),x(e,v.u.uEye,t.eye),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,b),e.uniform1i(v.u.uTex,0),e.depthMask(!1),e.disable(e.CULL_FACE),F({mesh:"quad",count:d.count,offset:f},!1)}e.depthMask(!0),e.disable(e.BLEND),e.enable(e.CULL_FACE),e.cullFace(e.BACK),N(u)};e.bindFramebuffer(e.FRAMEBUFFER,i.refl.fbo),e.viewport(0,0,i.refl.w,i.refl.h),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),r.reflK>0&&(e.frontFace(e.CW),B(t.vpMirror,[t.eye[0],-t.eye[1],t.eye[2]],0,!0),e.frontFace(e.CCW)),e.bindFramebuffer(e.FRAMEBUFFER,i.msaa),e.viewport(0,0,a,n),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT);{const u=s.sky;e.useProgram(u.p),e.uniformMatrix4fv(u.u.uInvVP,!1,t.invVp),D(u.u),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.CULL_FACE),e.bindVertexArray(o.meshes.screen.vao),e.drawElements(e.TRIANGLES,3,e.UNSIGNED_SHORT,0),e.enable(e.DEPTH_TEST),e.depthMask(!0)}{const u=s.floor,c=u.u;e.useProgram(u.p),e.uniformMatrix4fv(c.uVP,!1,t.vp),e.uniformMatrix4fv(c.uLightVP,!1,t.light.vp),x(e,c.uEye,t.eye),D(c),x(e,c.uFloorCol,r.floorCol),x(e,c.uGridCol,r.gridCol),e.uniform2f(c.uRes,a,n),m(e,c.uReflK,r.reflK),m(e,c.uGrid,r.grid),m(e,c.uShadowK,r.shadowK),m(e,c.uFloorF0,r.floorF0),m(e,c.uFar,r.far),m(e,c.uSpot,r.spot),m(e,c.uBlur,r.blur*a/1080),x(e,c.uSkyTop,r.envTop),x(e,c.uSkyMid,r.envMid),x(e,c.uSkyLow,r.envLow),x(e,c.uBoxCol,r.boxCol),e.uniform4fv(c.uBoxA,r.boxA),e.uniform4fv(c.uBoxB,r.boxB),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,o.shadow.tex),e.uniform1i(c.uShadowMap,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,i.refl.tex),e.uniform1i(c.uRefl,1),e.activeTexture(e.TEXTURE0),e.disable(e.CULL_FACE),e.bindVertexArray(o.meshes.quad.vao),e.drawElements(e.TRIANGLES,6,e.UNSIGNED_SHORT,0),e.enable(e.CULL_FACE)}B(t.vp,t.eye,1,!1),e.bindFramebuffer(e.READ_FRAMEBUFFER,i.msaa),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,i.scene.fbo),e.blitFramebuffer(0,0,a,n,0,0,a,n,e.COLOR_BUFFER_BIT,e.NEAREST),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.CULL_FACE),e.bindVertexArray(o.meshes.screen.vao),e.activeTexture(e.TEXTURE0);const P=(u,c,S,R)=>{e.bindFramebuffer(e.FRAMEBUFFER,c?c.fbo:null),e.viewport(0,0,c?c.w:a,c?c.h:n),e.useProgram(u.p),e.bindTexture(e.TEXTURE_2D,S),e.uniform1i(u.u.uTex,0),R(u.u),e.drawElements(e.TRIANGLES,3,e.UNSIGNED_SHORT,0)},w=t.post;return P(s.bright,i.bA,i.scene.tex,u=>{e.uniform2f(u.uPx,1/a,1/n),m(e,u.uThr,w.threshold)}),P(s.blur,i.bB,i.bA.tex,u=>e.uniform2f(u.uDir,1/i.bA.w,0)),P(s.blur,i.bA,i.bB.tex,u=>e.uniform2f(u.uDir,0,1/i.bA.h)),P(s.bright,i.cA,i.bA.tex,u=>{e.uniform2f(u.uPx,.5/i.bA.w,.5/i.bA.h),m(e,u.uThr,0)}),P(s.blur,i.cB,i.cA.tex,u=>e.uniform2f(u.uDir,1.6/i.cA.w,0)),P(s.blur,i.cA,i.cB.tex,u=>e.uniform2f(u.uDir,0,1.6/i.cA.h)),P(s.post,null,i.scene.tex,u=>{e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,i.bA.tex),e.uniform1i(u.uBloomA,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,i.cA.tex),e.uniform1i(u.uBloomB,2),e.activeTexture(e.TEXTURE0),m(e,u.uBloom,w.bloom),m(e,u.uVig,w.vignette),m(e,u.uGain,w.gain),m(e,u.uSat,w.sat),x(e,u.uLift,w.lift)}),e.bindVertexArray(null),e.bindFramebuffer(e.FRAMEBUFFER,null),!0}

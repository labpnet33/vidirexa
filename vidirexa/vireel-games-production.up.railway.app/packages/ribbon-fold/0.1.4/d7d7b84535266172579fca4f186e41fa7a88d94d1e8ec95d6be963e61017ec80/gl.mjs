const me=2048,be=1024,pe=16,Te=8,N=`
float S(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
`,k=`
uint pcg(uint v){uint s=v*747796405u+2891336453u;uint w=((s>>((s>>28u)+4u))^s)*277803737u;return (w>>22u)^w;}
float h21(vec2 p){ivec2 i=ivec2(floor(p));return float(pcg(uint(i.x)*1664525u+pcg(uint(i.y)+374761393u))>>8u)/16777216.;}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
`,O=`
uniform vec3 uSkyTop,uSkyMid,uSkyLow,uBoxCol;uniform vec4 uBoxA,uBoxB,uBoxC;
vec3 envSky(vec3 d){float t=d.y;return t>0.?mix(uSkyMid,uSkyTop,pow(t,.55)):mix(uSkyMid,uSkyLow,pow(-t,.45));}
vec3 env(vec3 d){
  float t=d.y;vec3 c=envSky(d);
  vec3 a=normalize(uBoxA.xyz);float da=dot(d,a);
  if(da>.2){vec3 ta=normalize(cross(a,vec3(0.,1.,.01))),ba=cross(ta,a);vec2 q=vec2(dot(d,ta),dot(d,ba))/da;c+=uBoxCol*uBoxA.w*S(.52,.36,abs(q.x))*S(.7,.5,abs(q.y));}
  vec3 b=normalize(uBoxB.xyz);float db=dot(d,b);
  if(db>.2){vec3 tb=normalize(cross(b,vec3(0.,1.,.01))),bb=cross(tb,b);vec2 q=vec2(dot(d,tb),dot(d,bb))/db;c+=uBoxCol*uBoxB.w*S(.22,.12,abs(q.x))*S(1.2,.9,abs(q.y));}
  if(uBoxC.w>0.){vec3 e=normalize(uBoxC.xyz);float de=dot(d,e);if(de>.2){vec3 te=normalize(cross(e,vec3(0.,1.,.01))),be=cross(te,e);vec2 q=vec2(dot(d,te),dot(d,be))/de;c+=uBoxCol*uBoxC.w*S(.3,.1,abs(q.x))*S(1.6,1.,abs(q.y));}}
  return c;}
`,X=`
uniform float uTime;uniform vec3 uBgTop,uBgMid,uBgLow,uGlowCol;uniform vec4 uSky; // x: horizon glow, y: stars, z: sun, w: haze bands
uniform vec3 uSunDir;
vec3 backdrop(vec3 d){
  float t=d.y;vec3 c=t>0.?mix(uBgMid,uBgTop,pow(t,.6)):mix(uBgMid,uBgLow,pow(-t,.6));
  c+=uGlowCol*uSky.x*exp(-abs(t)*6.);
  if(uSky.z>0.){float sd=max(dot(d,normalize(uSunDir)),0.);c+=uGlowCol*uSky.z*(pow(sd,180.)*1.2+pow(sd,9.)*.35);}
  if(uSky.y>0.&&t>.02){vec2 sp=vec2(atan(d.x,-d.z),asin(clamp(t,-1.,1.)))*38.;vec2 cell=floor(sp);float r=h21(cell);vec2 o=vec2(h21(cell+1.7),h21(cell+9.2))-.5;
    c+=vec3(.9,.95,1.)*uSky.y*S(.16,.0,length(fract(sp)-.5-o*.7))*step(.9,r)*(.5+.5*sin(uTime*(1.+r*3.)+r*60.));}
  if(uSky.w>0.){float band=fbm(vec2(atan(d.x,-d.z)*2.+uTime*.03,t*14.));c=mix(c,c*1.2+uGlowCol*.08,uSky.w*S(.45,.8,band)*S(.5,.0,abs(t-.12)));}
  return c;}
`,V=`
layout(location=0) in vec4 aV;      // ring, profile x, profile y
layout(location=1) in vec2 aN;      // profile normal
layout(location=2) in vec4 i0;      // x, z, heading x, heading z
layout(location=3) in vec4 i1;      // turn (end piece: +1 start, -1 end), index of the point, colour band, unused
uniform vec4 uGeo;     // tangent length, chords of the fillet, rings - 1, length of the rounded end
uniform vec4 uDim;     // unused, height, 1 = tube, segments of the whole ribbon
uniform vec4 uKind;    // 0 corner / 1 hinge / 2 end; 1 = part of the swinging copy; hinge radius factor; grow 0..1
uniform vec4 uSwingA;  // pivot x, pivot z, index of the pivot, segments of the copy
uniform vec4 uSwingB;  // progress 0..1, lag along the copy, whole turn (signed), lift
uniform vec4 uCopy;    // cos, sin of the copy's turn about the start, its lift, length of the ramp up to the lift (segments)
uniform vec4 uWave;    // crest (0..1 along the ribbon), width, extra height, squash
uniform vec4 uFloat;   // hover, bobbing, time, drop height of the first piece
float sm(float v){v=clamp(v,0.,1.);return v*v*(3.-2.*v);}
float sm5(float v){v=clamp(v,0.,1.);return v*v*v*(v*(v*6.-15.)+10.);}
vec2 rot(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
float liftAt(float x){float d=clamp((x-.72)/.28,0.,1.);return sm(x/.22)*(1.-d*d);}
vec3 ribbon(out vec3 N,out vec3 info){
  float j=aV.x,idx=i1.y,head=0.,sc=1.,sl=0.,latS=1.,verS=1.,capN=0.;vec2 h=i0.zw,lp=vec2(0.);
  float xh=clamp(uSwingB.x*(1.+uSwingB.y)-uSwingB.y*(.5/uSwingA.w),0.,1.);
  if(uKind.x<1.5){
    float phi=i1.x,tl=uGeo.x,r;
    if(uKind.x>.5){phi+=uSwingB.z*(sm5(xh/.8)-1.);float hp=abs(phi)*.5,cs=cos(hp),tn=max(tan(hp),1e-4);r=min(uKind.z*cs*cs,.5/tn);tl=r*tn;}
    else r=tl/max(tan(abs(phi)*.5),1e-4);
    float aphi=abs(phi),sg=phi<0.?-1.:1.,K=uGeo.y;
    if(j<.5){lp=vec2(-.5,0.);sl=-.5;}
    else if(j>K+1.5){lp=vec2(-tl+r*sin(aphi),sg*r*(1.-cos(aphi)))+(.5-tl)*vec2(cos(phi),sin(phi));head=phi;sl=.5;}
    else{float m=j-1.,a=aphi*m/K,hf=aphi/(2.*K);lp=vec2(-tl+r*sin(a),sg*r*(1.-cos(a)));
      if(m<.5){head=sg*hf*.5;sc=1./cos(hf*.5);}else if(m>K-.5){head=phi-sg*hf*.5;sc=1./cos(hf*.5);}else{head=sg*a;sc=1./cos(hf);}
      sl=tl*(2.*m/K-1.);}
  }else{
    float a=j/uGeo.z,cl=uGeo.w;
    if(a<.62){float b=(1.-a/.62)*1.5707963;lp=vec2(cl*(1.-sin(b)),0.);latS=cos(b);verS=mix(1.,cos(b),uDim.z);capN=sin(b);}
    else lp=vec2(mix(cl,.5,(a-.62)/.38),0.);
    sl=lp.x*i1.x;
  }
  vec2 T=rot(h,head),L=vec2(-T.y,T.x);
  float g=uKind.w,hgt=uDim.y,uu=(idx+sl)/uDim.w;
  float wv=(uu-uWave.x)/uWave.y,hs=(1.+uWave.z*exp(-wv*wv))*(1.-uWave.w);
  float y=(hgt*.5+(aV.z-hgt*.5)*verS)*hs*g;
  vec2 wp=i0.xy+h*lp.x+vec2(-h.y,h.x)*lp.y+L*(aV.y*sc*latS*g);
  float cb=sqrt(max(1.-capN*capN,0.));
  vec3 n=vec3(L.x*aN.x*cb-T.x*capN,aN.y*mix(1.,cb,uDim.z),L.y*aN.x*cb-T.y*capN);
  float glow=0.,pe=uu;
  if(uKind.y>.5){
    float dist=idx+sl-uSwingA.z,x=xh;
    if(uKind.x<.5||uKind.x>1.5){float d=clamp(dist/uSwingA.w,0.,1.);x=clamp(uSwingB.x*(1.+uSwingB.y)-uSwingB.y*d,0.,1.);
      float dl=uSwingB.z*(sm5(x/.8)-1.);wp=uSwingA.xy+rot(wp-uSwingA.xy,dl);n.xz=rot(n.xz,dl);}
    y+=uSwingB.w*liftAt(x)*sm(max(dist,0.)/uCopy.w);glow=sm(dist+.5);
    if(dist>0.)pe=mix(uSwingA.z-dist,uSwingA.z+dist,sm5(x/.8))/uDim.w;   // the copy leaves with the colours it lay on
  }
  y+=uFloat.x*(1.+uFloat.y*sin(uu*uDim.w*.21+uFloat.z*1.6))+uFloat.w*(1.-g)*(1.-g);
  y+=uCopy.z*sm((idx+sl)/uCopy.w);
  wp=vec2(uCopy.x*wp.x-uCopy.y*wp.y,uCopy.y*wp.x+uCopy.x*wp.y);n.xz=vec2(uCopy.x*n.x-uCopy.y*n.z,uCopy.y*n.x+uCopy.x*n.z);
  N=n;info=vec3(pe,aV.z/max(hgt,1e-4),glow);
  return vec3(wp.x,y,wp.y);}
`,K=`#version 300 es
precision highp float;
${V}
uniform mat4 uVP,uLightVP;uniform vec4 uPaint;uniform float uShadowBias;
out vec3 vPos,vNor,vInfo;out vec4 vShadow;out float vPal;
void main(){vec3 n,info;vec3 p=ribbon(n,info);vPos=p;vNor=n;vInfo=info;vPal=uPaint.x*info.x+uPaint.y*i1.z+uPaint.z;vShadow=uLightVP*vec4(p+normalize(n)*uShadowBias,1.);gl_Position=uVP*vec4(p,1.);}
`,Y=`#version 300 es
precision highp float;precision highp sampler2DShadow;
in vec3 vPos,vNor,vInfo;in vec4 vShadow;in float vPal;
uniform vec3 uEye,uLightDir,uLightCol,uAmbSky,uAmbGround,uFog;uniform float uFogK,uShadowOn,uClipY,uShadowSoft;
uniform sampler2DShadow uShadowMap;uniform sampler2D uPal;
uniform float uDiff,uWrap,uSpec,uShine,uEnvK,uMetal,uF0,uEmis,uRim,uWhite,uIri,uGlass,uBaseAo,uFill,uHue;uniform vec3 uFloorCol;
uniform vec4 uTint,uHi,uSweep;   // colour of a copy (rgb, share); glow of the moving copy, flash crest, flash width, flash; sweep direction x z, place, strength
${N}${O}
out vec4 o;
float shadow(){vec3 c=vShadow.xyz/vShadow.w*.5+.5;if(c.x<=0.||c.x>=1.||c.y<=0.||c.y>=1.||c.z>=1.)return 1.;float s=0.,t=uShadowSoft/2048.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)s+=texture(uShadowMap,vec3(c.xy+vec2(float(x),float(y))*t,c.z-.0016));return s/9.;}
void main(){
  if(vPos.y<uClipY)discard;
  vec3 N=normalize(vNor),V=normalize(uEye-vPos);if(!gl_FrontFacing)N=-N;
  float ndv=max(dot(N,V),0.),ndl=dot(N,uLightDir);
  float sh=uShadowOn>.5?shadow():1.;
  vec3 base=texture(uPal,vec2(clamp(vPal,.002,.998),.5)).rgb;
  if(uIri>0.){float k=(1.-ndv)*uIri;base=mix(base,texture(uPal,vec2(fract(vPal+.33+k*.5),.5)).rgb*1.1+vec3(.08),k);}
  if(uHue!=0.){vec3 kk=vec3(.57735);float ch=cos(uHue),shh=sin(uHue);base=clamp(base*ch+cross(kk,base)*shh+kk*dot(kk,base)*(1.-ch),0.,1.);}
  base=mix(base,uTint.rgb,uTint.a);base=mix(base,vec3(1.),uWhite);
  float low=mix(1.,S(-.1,.55,vInfo.y),uBaseAo);
  float dif=mix(max(ndl,0.),(ndl*.5+.5)*(ndl*.5+.5),uWrap)*mix(1.,sh,.7);
  vec3 amb=mix(uAmbGround,uAmbSky,N.y*.5+.5)*mix(1.,sh,.16)*low*uFill;
  float fres=uF0+(1.-uF0)*pow(1.-ndv,5.);
  vec3 col=base*(amb+uLightCol*dif)*uDiff;
  // glass without a second layer: the body takes the colour of the surface it stands on, tinted, and keeps its reflections
  if(uGlass>0.){vec3 thru=uFloorCol*mix(vec3(1.),base,.8)*(.72+.28*sh)+base*(.1+.16*vInfo.y);col=mix(col,thru,uGlass*(1.-fres)*(.55+.45*ndv));}
  if(uEnvK>0.){vec3 er=env(reflect(-V,N));if(uMetal>.5)er=min(er,vec3(1.05));   // metal keeps its colour under the soft boxes
    col+=er*mix(vec3(1.),base,uMetal)*uEnvK*mix(fres,1.,uMetal)*mix(1.,low,.5);}
  vec3 Hh=normalize(uLightDir+V);col+=uLightCol*pow(max(dot(N,Hh),0.),uShine)*uSpec*sh;
  col+=base*uEmis;
  col+=mix(base,vec3(1.),.35)*uRim*pow(1.-ndv,2.5);
  float fl=(vInfo.x-uHi.y)/uHi.z;col+=mix(base,vec3(1.),.5)*(uHi.x*vInfo.z+uHi.w*exp(-fl*fl));
  float sw=(dot(vPos.xz,uSweep.xy)-uSweep.z);col+=mix(base,vec3(1.),.6)*uSweep.w*exp(-sw*sw)*(.35+.65*max(N.y,0.));
  float f=1.-exp(-uFogK*length(uEye-vPos));col=mix(col,uFog,f);
  o=vec4(col,1.);}
`,G=`#version 300 es
precision highp float;
${V}
uniform mat4 uVP;out float vUp;
void main(){vec3 n,info;vec3 p=ribbon(n,info);vUp=p.y;gl_Position=uVP*vec4(p,1.);}
`,$=`#version 300 es
precision mediump float;void main(){}
`,j=`#version 300 es
precision highp float;in float vUp;uniform float uReach;out vec4 o;void main(){o=vec4(clamp(1.-vUp/uReach,0.,1.));}
`,Q=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;uniform mat4 uVP,uLightVP;
out vec3 vPos,vNor;out vec4 vShadow;
void main(){vPos=aPos;vNor=aNor;vShadow=uLightVP*vec4(aPos,1.);gl_Position=uVP*vec4(aPos,1.);}
`,J=`#version 300 es
precision highp float;precision highp sampler2DShadow;precision highp int;
in vec3 vPos,vNor;in vec4 vShadow;
uniform vec3 uEye,uLightDir,uLightCol,uAmbSky,uAmbGround;uniform vec2 uRes;
uniform vec4 uLayer;     // 0 desk / 1 top / 2 rim; plate on; contact shade strength; shadow softness
uniform vec4 uPlate,uPlateB;   // centre x z, half size x z; corner radius, thickness, far distance, sheen
uniform vec3 uColA,uColB,uColC;  // surface, pattern, second pattern colour
uniform vec4 uPat;       // kind, scale, strength, glow
uniform vec4 uSurf;      // mirror strength, F0, shadow strength, spot light
uniform vec4 uContactBox;  // x0, z0, 1/width, 1/depth of the map seen from above
uniform vec4 uSweep;uniform float uPulse,uReflBlur,uContactLod;
uniform sampler2D uRefl,uContact;uniform sampler2DShadow uShadowMap;
${N}${k}${O}${X}
out vec4 o;
float shadow(){vec3 c=vShadow.xyz/vShadow.w*.5+.5;if(c.x<=0.||c.x>=1.||c.y<=0.||c.y>=1.||c.z>=1.)return 1.;float s=0.,t=uLayer.w/2048.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)s+=texture(uShadowMap,vec3(c.xy+vec2(float(x),float(y))*t,c.z-.0012));
  for(int k=0;k<4;k++){vec2 d=vec2(k<2?-2.2:2.2,(k&1)==0?-2.2:2.2);s+=texture(uShadowMap,vec3(c.xy+d*t,c.z-.0012));}return s/13.;}
float box(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float lines(vec2 p,float w){vec2 g=abs(fract(p+.5)-.5),f=fwidth(p);vec2 a=vec2(S(f.x*(w+.9),f.x*max(w-.6,0.),g.x),S(f.y*(w+.9),f.y*max(w-.6,0.),g.y));float dense=S(.5,.16,max(f.x,f.y));return max(a.x,a.y)*dense;}
vec3 pattern(vec2 p,vec3 base,float dist,out float emit){
  emit=0.;float k=uPat.x;
  if(k<.5)return base;
  if(k<1.5){float a=lines(p,1.)*.7+lines(p*.25,1.5)+lines(p/16.,2.);return mix(base,uColB,clamp(a,0.,1.)*uPat.z);}
  if(k<2.5){vec2 q=p*uPat.y;q+=vec2(fbm(q*1.3),fbm(q*1.3+7.3))*1.6;float v=abs(fbm(q)-.5)*2.;float fw=fwidth(v);float vein=S(min(.07,fw*3.+.003),.0,v)*.85+S(min(.3,fw*12.+.01),.0,v)*.1;float cloud=fbm(q*.35+3.);
    return mix(mix(base,uColC,cloud*.3),uColB,vein*uPat.z);}
  if(k<3.5){float a=lines(p,1.)*.55+lines(p*.25,1.6)+lines(p/16.,2.2);vec2 g=abs(fract(p*.25+.5)-.5)*4.;float halo=exp(-min(g.x,g.y)*5.)*S(.5,.1,fwidth(p.x)*.25);
    vec3 lc=mix(uColB,uColC,.5+.5*sin(p.x*.05+p.y*.04+uTime*.4));emit=(clamp(a,0.,1.)+halo*.25)*uPat.z*(.7+.6*uPulse);return base+lc*emit;}
  if(k<4.5){vec2 f=fwidth(p);float fm=max(f.x,f.y);float dense=S(.3,.09,fm);vec2 g=fract(p+.5)-.5;float d=length(g);float a=S(.055+fm,.055-fm*.5,d)*dense;
    vec2 g2=fract(p*.25+.5)-.5;float d2=length(g2)*4.;float a2=S(.16+fm*1.5,.16-fm,d2)*S(1.4,.3,fm)*S(.06,.2,fm);return mix(base,uColB,max(a,a2)*uPat.z);}
  if(k<5.5){vec2 q=p*uPat.y;vec2 c=floor(q);float best=9.,id=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 cc=c+vec2(float(x),float(y));vec2 o2=vec2(h21(cc+3.1),h21(cc+7.7));float sz=.18+.3*h21(cc+11.);vec2 dq=q-cc-o2;
      float ang=h21(cc+5.)*6.28;dq=vec2(cos(ang)*dq.x-sin(ang)*dq.y,sin(ang)*dq.x+cos(ang)*dq.y);float d=max(abs(dq.x)*1.3,abs(dq.y))/sz;if(d<best){best=d;id=h21(cc+19.);}}
    float a=S(1.,.82,best)*S(.9,.3,fwidth(q.x));vec3 chip=id<.34?uColB:id<.67?uColC:mix(uColB,vec3(1.),.6);return mix(base,chip,a*uPat.z);}
  if(k<6.5){float a=lines(p,.8)*.45+lines(p*.25,1.3)*.8+lines(p/16.,2.);vec2 g=abs(fract(p*.25+.5)-.5)*4.;float cross=S(.34,.3,max(g.x,g.y))*S(.06,.03,min(g.x,g.y))*S(.3,.08,fwidth(p.x));
    return mix(base,uColB,clamp(a+cross,0.,1.)*uPat.z);}
  vec2 q=p*uPat.y;float t=uTime*.35;float c1=sin(q.x*1.7+sin(q.y*1.3+t)*1.6+t)+sin(q.y*1.9+sin(q.x*1.1-t*.8)*1.7);float c2=sin((q.x+q.y)*1.2+sin(q.x*.7-t)*2.+t*.6);
  float ca=pow(S(.6,2.,abs(c1+c2*.6)),1.5)*S(1.1,.3,fwidth(q.x));return mix(base,uColB,ca*uPat.z)+uColC*S(1.2,2.4,c1+c2)*.12*uPat.z;}
void main(){
  vec3 toP=vPos-uEye;float dist=length(toP);vec3 D=toP/dist,V=-D;vec3 N=normalize(vNor);
  vec2 rel=vPos.xz-uPlate.xy;float sd=box(rel,uPlate.zw,uPlateB.x);
  float layer=uLayer.x;vec3 col;float emit=0.;
  if(layer>1.5){ // rim of the plate
    float ndl=max(dot(N,uLightDir),0.);vec3 base=mix(uColA*.82,uColB,.06);float e=S(-uPlateB.y,0.,vPos.y);
    col=base*(mix(uAmbGround,uAmbSky,.5)+uLightCol*ndl*.75)*mix(.72,1.,e);col+=env(reflect(D,N))*.12;
    o=vec4(col,1.);return;}
  if(layer>.5){ // the top of the plate (or the open floor)
    vec3 base=pattern(vPos.xz,uColA,dist,emit);
    float sp=exp(-dot(rel,rel)/(uPlate.z*uPlate.w*1.2+30.));base*=mix(1.,.62+.62*sp,uSurf.w);
    float sh=shadow();
    vec2 cuv=(vPos.xz-uContactBox.xy)*uContactBox.zw;float ao=0.;
    if(cuv.x>0.&&cuv.x<1.&&cuv.y>0.&&cuv.y<1.){float r=exp2(uContactLod)/1024.*.8;
      ao=textureLod(uContact,cuv,uContactLod).r*.4+(textureLod(uContact,cuv+vec2(r,r*.4),uContactLod+.6).r+textureLod(uContact,cuv+vec2(-r*.4,r),uContactLod+.6).r+textureLod(uContact,cuv+vec2(-r,-r*.4),uContactLod+.6).r+textureLod(uContact,cuv+vec2(r*.4,-r),uContactLod+.6).r)*.15;
      ao=S(0.,.75,ao);}
    float lit=mix(1.,sh,uSurf.z)*(1.-ao*uLayer.z);
    float fres=uSurf.y+(1.-uSurf.y)*pow(1.-max(V.y,0.),5.);
    vec2 uv=gl_FragCoord.xy/uRes;vec4 r=vec4(0.);float ws=0.;vec2 px=uReflBlur/uRes;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){float w=1./(1.+float(x*x+y*y));r+=texture(uRefl,uv+vec2(float(x),float(y)*1.6)*px)*w;ws+=w;}r/=ws;
    vec3 Rd=vec3(D.x,-D.y,D.z);vec3 sky=envSky(Rd);vec3 mirror=mix(sky,r.rgb/max(r.a,.001),clamp(r.a,0.,1.));
    float light=.74+.26*max(dot(N,uLightDir),0.);
    col=base*light*lit+mirror*uSurf.x*fres*mix(1.,lit,.4)+uColB*emit*.6;
    if(uLayer.y>.5){float e=S(-.34,-.02,sd);col+=vec3(1.)*e*.05*(.4+.6*uLightCol);float wl=max(fwidth(sd)*1.2,uPlateB.x*.035);float ln=S(wl,0.,abs(sd+uPlateB.x*.32));col=mix(col,uColB*1.15,ln*.42);}
    float sw=dot(vPos.xz,uSweep.xy)-uSweep.z;col+=mix(base,vec3(1.),.5)*uSweep.w*.12*exp(-sw*sw*.6);
    if(uLayer.y<.5){vec3 bd=backdrop(vec3(D.x,max(D.y,-.02)*.2,D.z));col=mix(col,bd,S(uPlateB.z*.3,uPlateB.z,dist));}
    o=vec4(col,1.);return;}
  // the desk under the plate: the plate's own soft shadow and shade lie on it
  float emitD;vec3 base=uColC;
  vec2 off=-uLightDir.xz/max(uLightDir.y,.2)*uPlateB.y;float sdS=box(rel-off,uPlate.zw,uPlateB.x);
  float soft=uPlateB.y*1.6+.12;float shade=S(soft,-soft*.6,sdS)*.5+S(uPlateB.y*5.+1.,-.2,sd)*.2;
  float sp=exp(-dot(rel,rel)/(uPlate.z*uPlate.w*3.+60.));base*=mix(1.,.7+.42*sp,uSurf.w);
  col=base*(1.-shade*uSurf.z*1.25);
  float fresD=.03+.97*pow(1.-max(V.y,0.),5.);col+=envSky(vec3(D.x,-D.y,D.z))*fresD*.25;
  vec3 bd=backdrop(vec3(D.x,max(D.y,-.02)*.2,D.z));col=mix(col,bd,S(uPlateB.z*.3,uPlateB.z,dist));
  o=vec4(col,1.);}
`,Z=`#version 300 es
layout(location=0) in vec3 aPos;uniform mat4 uInvVP;out vec3 vDir;
void main(){vec4 a=uInvVP*vec4(aPos.xy,-1.,1.),b=uInvVP*vec4(aPos.xy,1.,1.);vDir=b.xyz/b.w-a.xyz/a.w;gl_Position=vec4(aPos.xy,1.,1.);}
`,ee=`#version 300 es
precision highp float;precision highp int;in vec3 vDir;
${N}${k}${X}
out vec4 o;void main(){o=vec4(backdrop(normalize(vDir)),1.);}
`,te=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=2) in vec4 i0;layout(location=3) in vec4 i1;layout(location=4) in vec4 i2;layout(location=5) in vec4 i3;
uniform mat4 uVP;uniform vec3 uCamR,uCamU;
out vec2 vUv;out vec4 vCol;out vec4 vPar;
void main(){float m=i2.x;vec2 q=aPos.xy;vUv=q;vCol=i3;vPar=i2;vec3 p;
  if(m<.5||m>2.5){vec3 r=uCamR,u=uCamU;if(m>2.5){vec3 v=i1.xyz;float l=length(v);vec3 dir=l>1e-4?v/l:u;r=normalize(cross(dir,cross(uCamR,uCamU)));u=dir*(1.+i2.z);}p=i0.xyz+(r*q.x+u*q.y)*i0.w;}
  else p=i0.xyz+vec3(q.x,0.,q.y)*i0.w;
  gl_Position=uVP*vec4(p,1.);}
`,oe=`#version 300 es
precision highp float;in vec2 vUv;in vec4 vCol;in vec4 vPar;out vec4 o;
float S(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
void main(){float d=length(vUv),a=0.;
  if(vPar.x<.5){a=S(1.,0.,d);a*=a;}
  else if(vPar.x<1.5){float w=vPar.y;a=S(w,0.,abs(d-(1.-w)))*step(d,1.);}
  else if(vPar.x<2.5){a=S(1.,0.,d);a*=a;}
  else{a=S(1.,.2,abs(vUv.x))*S(1.,0.,abs(vUv.y));}
  o=vec4(vCol.rgb*vCol.a*a,0.);}
`,M=`#version 300 es
layout(location=0) in vec3 aPos;out vec2 vUv;void main(){vUv=aPos.xy*.5+.5;gl_Position=vec4(aPos.xy,0.,1.);}
`,ae=`#version 300 es
precision highp float;in vec2 vUv;uniform sampler2D uTex;uniform vec2 uPx;uniform float uThr;out vec4 o;
void main(){vec3 c=vec3(0.);for(int y=0;y<2;y++)for(int x=0;x<2;x++)c+=texture(uTex,vUv+(vec2(float(x),float(y))*2.-1.)*uPx).rgb;c*=.25;
  float l=max(c.r,max(c.g,c.b));float k=max(l-uThr,0.)/max(l,1e-4);o=vec4(c*k,1.);}
`,re=`#version 300 es
precision highp float;in vec2 vUv;uniform sampler2D uTex;uniform vec2 uDir;out vec4 o;
void main(){vec3 c=texture(uTex,vUv).rgb*.227027;
  c+=(texture(uTex,vUv+uDir*1.3846).rgb+texture(uTex,vUv-uDir*1.3846).rgb)*.316216;
  c+=(texture(uTex,vUv+uDir*3.2308).rgb+texture(uTex,vUv-uDir*3.2308).rgb)*.070270;o=vec4(c,1.);}
`,ie=`#version 300 es
precision highp float;in vec2 vUv;uniform sampler2D uTex,uBloomA,uBloomB;uniform float uBloom,uVig,uGain,uSat;uniform vec3 uLift;out vec4 o;
void main(){vec3 c=texture(uTex,vUv).rgb;vec3 b=texture(uBloomA,vUv).rgb*.6+texture(uBloomB,vUv).rgb*.9;c+=b*uBloom;
  vec2 q=vUv-.5;c*=1.-uVig*dot(q,q)*1.6;c=c*uGain+uLift*(1.-c);float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);
  c=c/(1.+max(c-.82,0.)*1.4);
  vec2 dq=floor(gl_FragCoord.xy);float dn=fract(52.9829189*fract(.06711056*dq.x+.00583715*dq.y));c+=(dn-.5)/255.;o=vec4(c,1.);}
`,ue={alpha:!1,depth:!1,stencil:!1,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance",failIfMajorPerformanceCaveat:!1},g={created:0,released:0,lost:0,failed:0};let p=null,F="",U=0;const q={ribbon:[K,Y],depth:[G,$],contact:[G,j],stage:[Q,J],sky:[Z,ee],fx:[te,oe],bright:[M,ae],blur:[M,re],post:[M,ie]};function ne(a,t,o,n){const e=(v,s)=>{const d=a.createShader(v);return a.shaderSource(d,s),a.compileShader(d),d},r=e(a.VERTEX_SHADER,t),c=e(a.FRAGMENT_SHADER,o),E=a.createProgram();return a.attachShader(E,r),a.attachShader(E,c),a.linkProgram(E),{p:E,v:r,f:c,name:n,u:null}}function ce(a,t){if(t.u)return t;if(!a.getProgramParameter(t.p,a.LINK_STATUS)&&!a.isContextLost())throw new Error(`Shader ${t.name}: ${a.getProgramInfoLog(t.p)||""} ${a.getShaderInfoLog(t.v)||""} ${a.getShaderInfoLog(t.f)||""}`.slice(0,1200));a.deleteShader(t.v),a.deleteShader(t.f);const o={},n=a.getProgramParameter(t.p,a.ACTIVE_UNIFORMS)||0;for(let e=0;e<n;e++){const r=a.getActiveUniform(t.p,e);r&&(o[r.name.replace(/\[0\]$/,"")]=a.getUniformLocation(t.p,r.name))}return t.u=o,t}function se(){if(typeof document>"u")return null;const a=document.createElement("canvas");a.width=a.height=2;let t=null;try{t=a.getContext("webgl2",ue)}catch(n){F=n.message}if(!t||t.isContextLost())return F=F||"This browser could not start WebGL2.",null;const o={canvas:a,gl:t,users:0,dead:!1,targets:new Map,prog:{},fxBuf:t.createBuffer(),fxBytes:0,samples:Math.min(4,t.getParameter(t.MAX_SAMPLES)||0),name:"",id:g.created+1};try{o.parallel=t.getExtension("KHR_parallel_shader_compile");for(const[d,[A,T]]of Object.entries(q))o.prog[d]=ne(t,A,T,d);const n=(d,A)=>{const T=t.createVertexArray();t.bindVertexArray(T);const h=t.createBuffer();return t.bindBuffer(t.ARRAY_BUFFER,h),t.bufferData(t.ARRAY_BUFFER,new Float32Array(d),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,12,0),T};o.screen=n([-1,-1,0,3,-1,0,-1,3,0]),o.fxVao=n([-1,-1,0,1,-1,0,1,1,0,-1,-1,0,1,1,0,-1,1,0]),t.bindBuffer(t.ARRAY_BUFFER,o.fxBuf);for(let d=2;d<=5;d++)t.enableVertexAttribArray(d),t.vertexAttribPointer(d,4,t.FLOAT,!1,64,(d-2)*16),t.vertexAttribDivisor(d,1);t.bindVertexArray(null);const e=t.createTexture();t.bindTexture(t.TEXTURE_2D,e),t.texStorage2D(t.TEXTURE_2D,1,t.DEPTH_COMPONENT24,2048,2048),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_COMPARE_MODE,t.COMPARE_REF_TO_TEXTURE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_COMPARE_FUNC,t.LEQUAL);const r=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,r),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,e,0),t.drawBuffers([t.NONE]),t.readBuffer(t.NONE),o.shadow={tex:e,fbo:r};const c=t.createTexture();t.bindTexture(t.TEXTURE_2D,c);const E=Math.floor(Math.log2(1024))+1;t.texStorage2D(t.TEXTURE_2D,E,t.R8,1024,1024),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);const v=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,v),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,c,0);const s=t.createRenderbuffer();t.bindRenderbuffer(t.RENDERBUFFER,s),t.renderbufferStorage(t.RENDERBUFFER,t.DEPTH_COMPONENT16,1024,1024),t.framebufferRenderbuffer(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.RENDERBUFFER,s),o.contact={tex:c,fbo:v},t.bindFramebuffer(t.FRAMEBUFFER,null);try{const d=t.getExtension("WEBGL_debug_renderer_info");o.name=String(d?t.getParameter(d.UNMASKED_RENDERER_WEBGL):t.getParameter(t.RENDERER))}catch{}}catch(n){F=n.message;try{t.getExtension("WEBGL_lose_context")?.loseContext()}catch{}return null}return a.addEventListener("webglcontextlost",n=>{n.preventDefault(),!o.dead&&(o.dead=!0,g.lost++,p===o&&(p=null),U=performance.now()+800)}),g.created++,F="",o}function P(a,t,o,n){const e=a.createTexture();a.bindTexture(a.TEXTURE_2D,e),a.texStorage2D(a.TEXTURE_2D,1,a.RGBA8,t,o),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,n),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,n),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE);const r=a.createFramebuffer();return a.bindFramebuffer(a.FRAMEBUFFER,r),a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0,a.TEXTURE_2D,e,0),{tex:e,fbo:r,w:t,h:o}}function le(a,t,o){const n=t+"x"+o;let e=a.targets.get(n);if(e)return e.used=performance.now(),e;const r=a.gl;if(a.targets.size>=2){let T=null,h="";for(const[L,D]of a.targets)(!T||D.used<T.used)&&(T=D,h=L);fe(r,T),a.targets.delete(h)}e={used:performance.now(),w:t,h:o},e.msaa=r.createFramebuffer(),r.bindFramebuffer(r.FRAMEBUFFER,e.msaa),e.rbColor=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,e.rbColor),r.renderbufferStorageMultisample(r.RENDERBUFFER,a.samples,r.RGBA8,t,o),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,e.rbColor),e.rbDepth=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,e.rbDepth),r.renderbufferStorageMultisample(r.RENDERBUFFER,a.samples,r.DEPTH_COMPONENT24,t,o),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,e.rbDepth),e.scene=P(r,t,o,r.LINEAR);const c=Math.max(2,t>>1),E=Math.max(2,o>>1);e.refl=P(r,c,E,r.LINEAR),e.reflDepth=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,e.reflDepth),r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_COMPONENT24,c,E),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,e.reflDepth);const v=Math.max(2,t>>2),s=Math.max(2,o>>2),d=Math.max(2,t>>3),A=Math.max(2,o>>3);return e.bA=P(r,v,s,r.LINEAR),e.bB=P(r,v,s,r.LINEAR),e.cA=P(r,d,A,r.LINEAR),e.cB=P(r,d,A,r.LINEAR),r.bindFramebuffer(r.FRAMEBUFFER,null),a.targets.set(n,e),e}function fe(a,t){for(const o of["scene","refl","bA","bB","cA","cB"])a.deleteTexture(t[o].tex),a.deleteFramebuffer(t[o].fbo);a.deleteFramebuffer(t.msaa),a.deleteRenderbuffer(t.rbColor),a.deleteRenderbuffer(t.rbDepth),a.deleteRenderbuffer(t.reflDepth)}const H=()=>{if(!p){if(performance.now()<U)return null;if(p=se(),!p)return g.failed++,U=performance.now()+1500,null}return p};export function acquire(){const a=H();return a&&(a.users++,clearTimeout(a.idle)),a}export async function prepare(){const a=H();if(!a)return!1;const t=a.gl,o=a.parallel;if(!o)return!0;const n=performance.now()+1e4;for(;;){if(a.dead||t.isContextLost())return!1;let e=!0;for(const r of Object.values(a.prog))if(!r.u&&!t.getProgramParameter(r.p,o.COMPLETION_STATUS_KHR)){e=!1;break}if(e||performance.now()>n)return!0;await new Promise(r=>setTimeout(r,8))}}export function release(a){a&&(a.users--,!(a.users>0||a.dead)&&(clearTimeout(a.idle),a.idle=setTimeout(()=>{if(!(a.users>0||a.dead)){a.dead=!0,p===a&&(p=null),g.released++;try{a.gl.getExtension("WEBGL_lose_context")?.loseContext()}catch{}a.canvas.width=a.canvas.height=1}},5e3)))}export function gpuStats(){return{...g,live:p?1:0,users:p?.users??0,renderer:p?.name??"",error:F,targets:p?[...p.targets.keys()]:[]}}export function createClip(a,t){const o=a.gl,n={host:a,lods:[],ranges:t.stage.ranges};n.inst=o.createBuffer(),o.bindBuffer(o.ARRAY_BUFFER,n.inst),o.bufferData(o.ARRAY_BUFFER,t.instances,o.STATIC_DRAW);for(const e of t.lods){const r=o.createVertexArray();o.bindVertexArray(r);const c=o.createBuffer();o.bindBuffer(o.ARRAY_BUFFER,c),o.bufferData(o.ARRAY_BUFFER,e.verts,o.STATIC_DRAW),o.enableVertexAttribArray(0),o.vertexAttribPointer(0,4,o.FLOAT,!1,24,0),o.enableVertexAttribArray(1),o.vertexAttribPointer(1,2,o.FLOAT,!1,24,16);const E=o.createBuffer();o.bindBuffer(o.ELEMENT_ARRAY_BUFFER,E),o.bufferData(o.ELEMENT_ARRAY_BUFFER,e.index,o.STATIC_DRAW),o.bindBuffer(o.ARRAY_BUFFER,n.inst);for(let v=2;v<=3;v++)o.enableVertexAttribArray(v),o.vertexAttribPointer(v,4,o.FLOAT,!1,32,(v-2)*16),o.vertexAttribDivisor(v,1);n.lods.push({vao:r,vb:c,ib:E,count:e.index.length,chords:e.chords,rings:e.rings})}{const e=o.createVertexArray();o.bindVertexArray(e);const r=o.createBuffer();o.bindBuffer(o.ARRAY_BUFFER,r),o.bufferData(o.ARRAY_BUFFER,t.stage.verts,o.STATIC_DRAW),o.enableVertexAttribArray(0),o.vertexAttribPointer(0,3,o.FLOAT,!1,24,0),o.enableVertexAttribArray(1),o.vertexAttribPointer(1,3,o.FLOAT,!1,24,12);const c=o.createBuffer();o.bindBuffer(o.ELEMENT_ARRAY_BUFFER,c),o.bufferData(o.ELEMENT_ARRAY_BUFFER,t.stage.index,o.STATIC_DRAW),n.stage={vao:e,vb:r,ib:c}}return o.bindVertexArray(null),n.pal=o.createTexture(),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,n.pal),o.pixelStorei(o.UNPACK_ALIGNMENT,1),o.pixelStorei(o.UNPACK_FLIP_Y_WEBGL,!1),o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,256,1,0,o.RGBA,o.UNSIGNED_BYTE,t.palette),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),n}export function dropClip(a){if(!a||a.gone)return;a.gone=!0;const t=a.host;if(!t||t.dead)return;const o=t.gl;for(const n of a.lods)o.deleteVertexArray(n.vao),o.deleteBuffer(n.vb),o.deleteBuffer(n.ib);o.deleteVertexArray(a.stage.vao),o.deleteBuffer(a.stage.vb),o.deleteBuffer(a.stage.ib),o.deleteBuffer(a.inst),o.deleteTexture(a.pal)}const f=(a,t,o)=>{t&&a.uniform3f(t,o[0],o[1],o[2])},x=(a,t,o)=>{t&&a.uniform4f(t,o[0],o[1],o[2],o[3])},m=(a,t,o)=>{t&&a.uniform1f(t,o)},ve=["uDiff","uWrap","uSpec","uShine","uEnvK","uMetal","uF0","uEmis","uRim","uWhite","uIri","uGlass","uBaseAo"],xe={uDiff:1,uWrap:0,uSpec:.3,uShine:40,uEnvK:0,uMetal:0,uF0:.04,uEmis:0,uRim:0,uWhite:0,uIri:0,uGlass:0,uBaseAo:.5},de=[1,0,0,1.6],Ee=[0,0,0,0];export function drawFrame(a,t,o,n){const e=a.gl;if(a.dead||e.isContextLost())return!1;(a.canvas.width!==o||a.canvas.height!==n)&&(a.canvas.width=o,a.canvas.height=n);const r=t.look,c={},E=t.clip,v=t.ribbon;try{for(const i of Object.keys(q))c[i]=ce(e,a.prog[i])}catch(i){return F=i.message,a.dead=!0,p===a&&(p=null),g.failed++,U=performance.now()+5e3,!1}const s=le(a,o,n),d=t.fx.count*16*4;d&&(e.bindBuffer(e.ARRAY_BUFFER,a.fxBuf),d>a.fxBytes&&(a.fxBytes=Math.max(d*2,16384),e.bufferData(e.ARRAY_BUFFER,a.fxBytes,e.STREAM_DRAW)),e.bufferSubData(e.ARRAY_BUFFER,0,t.fx.data,0,t.fx.count*16)),e.disable(e.BLEND),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.depthMask(!0),e.enable(e.CULL_FACE),e.cullFace(e.BACK),e.frontFace(e.CCW),e.colorMask(!0,!0,!0,!0);const A=(i,u)=>{x(e,i.uGeo,[v.tangent,u.chords,u.rings-1,v.capLen]),x(e,i.uDim,v.dim),x(e,i.uSwingA,v.swingA),x(e,i.uSwingB,v.swingB),x(e,i.uWave,v.wave),x(e,i.uFloat,v.float)},T=(i,u,R)=>{e.bindVertexArray(u.vao),e.bindBuffer(e.ARRAY_BUFFER,E.inst);for(const b of v.parts)if(b.count){x(e,i.uKind,[b.kind,b.move?1:0,v.hingeK,b.grow??1]),x(e,i.uCopy,b.copy??de),R&&R(b);for(let y=2;y<=3;y++)e.vertexAttribPointer(y,4,e.FLOAT,!1,32,b.first*8*4+(y-2)*16);e.drawElementsInstanced(e.TRIANGLES,u.count,e.UNSIGNED_SHORT,0,b.count)}},h=E.lods[v.lodAux],L=E.lods[v.lod];e.bindFramebuffer(e.FRAMEBUFFER,a.shadow.fbo),e.viewport(0,0,2048,2048),e.clearDepth(1),e.clear(e.DEPTH_BUFFER_BIT),e.useProgram(c.depth.p),e.uniformMatrix4fv(c.depth.u.uVP,!1,t.light.vp),e.enable(e.POLYGON_OFFSET_FILL),e.polygonOffset(1.5,2),e.disable(e.CULL_FACE),A(c.depth.u,h),T(c.depth.u,h),e.disable(e.POLYGON_OFFSET_FILL),e.bindFramebuffer(e.FRAMEBUFFER,a.contact.fbo),e.viewport(0,0,1024,1024),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),r.contactK>0&&(e.useProgram(c.contact.p),e.uniformMatrix4fv(c.contact.u.uVP,!1,t.contact.vp),m(e,c.contact.u.uReach,t.contact.reach),e.depthFunc(e.GEQUAL),e.clearDepth(0),e.clear(e.DEPTH_BUFFER_BIT),A(c.contact.u,h),T(c.contact.u,h),e.depthFunc(e.LEQUAL),e.clearDepth(1)),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,a.contact.tex),e.generateMipmap(e.TEXTURE_2D),e.enable(e.CULL_FACE);const D=t.mat,z=(i,u,R,b,y)=>{const w=c.ribbon,l=w.u;e.useProgram(w.p),e.uniformMatrix4fv(l.uVP,!1,i),e.uniformMatrix4fv(l.uLightVP,!1,t.light.vp),f(e,l.uEye,u),f(e,l.uLightDir,t.light.dir),f(e,l.uLightCol,t.light.color),f(e,l.uAmbSky,r.ambSky),f(e,l.uAmbGround,r.ambGround),f(e,l.uFog,r.fog),m(e,l.uFogK,r.fogK),m(e,l.uShadowOn,R),m(e,l.uClipY,b),m(e,l.uShadowSoft,t.light.soft),m(e,l.uShadowBias,t.light.bias),f(e,l.uSkyTop,r.envTop),f(e,l.uSkyMid,r.envMid),f(e,l.uSkyLow,r.envLow),f(e,l.uBoxCol,r.boxCol),x(e,l.uBoxA,r.boxA),x(e,l.uBoxB,t.boxB??r.boxB),x(e,l.uBoxC,t.boxC);for(const _ of ve)m(e,l[_],D[_]??xe[_]);x(e,l.uPaint,v.paint),x(e,l.uHi,v.hi),x(e,l.uSweep,t.sweep),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,a.shadow.tex),e.uniform1i(l.uShadowMap,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,E.pal),e.uniform1i(l.uPal,1),e.activeTexture(e.TEXTURE0),A(l,y),m(e,l.uFill,r.fill??1),f(e,l.uFloorCol,r.top.colA),T(l,y,_=>{x(e,l.uTint,_.tint??Ee),m(e,l.uHue,_.hue??0)})},W=i=>{if(!t.fx.count)return;const u=c.fx;e.useProgram(u.p),e.uniformMatrix4fv(u.u.uVP,!1,i),f(e,u.u.uCamR,t.camR),f(e,u.u.uCamU,t.camU),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE),e.depthMask(!1),e.disable(e.CULL_FACE),e.bindVertexArray(a.fxVao),e.drawArraysInstanced(e.TRIANGLES,0,6,t.fx.count),e.depthMask(!0),e.disable(e.BLEND),e.enable(e.CULL_FACE)};e.bindFramebuffer(e.FRAMEBUFFER,s.refl.fbo),e.viewport(0,0,s.refl.w,s.refl.h),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),r.reflK>.01&&(e.frontFace(e.CW),z(t.vpMirror,[t.eye[0],-t.eye[1],t.eye[2]],0,5e-4,h),e.frontFace(e.CCW)),e.bindFramebuffer(e.FRAMEBUFFER,s.msaa),e.viewport(0,0,o,n),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT);const I=i=>{m(e,i.uTime,t.time),f(e,i.uBgTop,r.bgTop),f(e,i.uBgMid,r.bgMid),f(e,i.uBgLow,r.bgLow),f(e,i.uGlowCol,r.glowCol),x(e,i.uSky,r.sky),f(e,i.uSunDir,r.sunDir)};{const i=c.sky;e.useProgram(i.p),e.uniformMatrix4fv(i.u.uInvVP,!1,t.invVp),I(i.u),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.CULL_FACE),e.bindVertexArray(a.screen),e.drawArrays(e.TRIANGLES,0,3),e.enable(e.DEPTH_TEST),e.depthMask(!0)}{const i=c.stage,u=i.u,R=t.stage;e.useProgram(i.p),e.uniformMatrix4fv(u.uVP,!1,t.vp),e.uniformMatrix4fv(u.uLightVP,!1,t.light.vp),f(e,u.uEye,t.eye),I(u),f(e,u.uLightDir,t.light.dir),f(e,u.uLightCol,t.light.color),f(e,u.uAmbSky,r.ambSky),f(e,u.uAmbGround,r.ambGround),e.uniform2f(u.uRes,o,n),x(e,u.uPlate,R.plate),x(e,u.uPlateB,R.plateB),x(e,u.uContactBox,t.contact.box),x(e,u.uSweep,t.sweep),m(e,u.uPulse,t.pulse),m(e,u.uReflBlur,r.blur*o/1080),m(e,u.uContactLod,t.contact.lod),f(e,u.uSkyTop,r.envTop),f(e,u.uSkyMid,r.envMid),f(e,u.uSkyLow,r.envLow),f(e,u.uBoxCol,r.boxCol),x(e,u.uBoxA,r.boxA),x(e,u.uBoxB,t.boxB??r.boxB),x(e,u.uBoxC,t.boxC),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,a.shadow.tex),e.uniform1i(u.uShadowMap,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,s.refl.tex),e.uniform1i(u.uRefl,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,a.contact.tex),e.uniform1i(u.uContact,2),e.activeTexture(e.TEXTURE0),e.disable(e.CULL_FACE),e.bindVertexArray(E.stage.vao);const b=(y,w,l)=>{if(!w[1])return;const C=l?r.top:r.desk;x(e,u.uLayer,[y,R.plateOn?1:0,r.contactK,t.light.soft*1.6]),f(e,u.uColA,C.colA),f(e,u.uColB,C.colB),f(e,u.uColC,l?C.colC:r.desk.colA),x(e,u.uPat,C.pat),x(e,u.uSurf,[l?r.reflK:0,r.floorF0,r.shadowK,r.spot]),e.drawElements(e.TRIANGLES,w[1],e.UNSIGNED_SHORT,w[0]*2)};R.plateOn?(b(0,E.ranges.desk,!1),b(2,E.ranges.rim,!0),b(1,E.ranges.top,!0)):b(1,E.ranges.desk,!0),e.enable(e.CULL_FACE)}z(t.vp,t.eye,1,-1e6,L),W(t.vp),e.bindFramebuffer(e.READ_FRAMEBUFFER,s.msaa),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,s.scene.fbo),e.blitFramebuffer(0,0,o,n,0,0,o,n,e.COLOR_BUFFER_BIT,e.NEAREST),e.disable(e.DEPTH_TEST),e.depthMask(!1),e.disable(e.CULL_FACE),e.bindVertexArray(a.screen),e.activeTexture(e.TEXTURE0);const S=(i,u,R,b)=>{e.bindFramebuffer(e.FRAMEBUFFER,u?u.fbo:null),e.viewport(0,0,u?u.w:o,u?u.h:n),e.useProgram(i.p),e.bindTexture(e.TEXTURE_2D,R),e.uniform1i(i.u.uTex,0),b(i.u),e.drawArrays(e.TRIANGLES,0,3)},B=t.post;return S(c.bright,s.bA,s.scene.tex,i=>{e.uniform2f(i.uPx,1/o,1/n),m(e,i.uThr,B.threshold)}),S(c.blur,s.bB,s.bA.tex,i=>e.uniform2f(i.uDir,1/s.bA.w,0)),S(c.blur,s.bA,s.bB.tex,i=>e.uniform2f(i.uDir,0,1/s.bA.h)),S(c.bright,s.cA,s.bA.tex,i=>{e.uniform2f(i.uPx,.5/s.bA.w,.5/s.bA.h),m(e,i.uThr,0)}),S(c.blur,s.cB,s.cA.tex,i=>e.uniform2f(i.uDir,1.6/s.cA.w,0)),S(c.blur,s.cA,s.cB.tex,i=>e.uniform2f(i.uDir,0,1.6/s.cA.h)),S(c.post,null,s.scene.tex,i=>{e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,s.bA.tex),e.uniform1i(i.uBloomA,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,s.cA.tex),e.uniform1i(i.uBloomB,2),e.activeTexture(e.TEXTURE0),m(e,i.uBloom,B.bloom),m(e,i.uVig,B.vignette),m(e,i.uGain,B.gain),m(e,i.uSat,B.sat),f(e,i.uLift,B.lift)}),e.bindVertexArray(null),e.bindFramebuffer(e.FRAMEBUFFER,null),!0}

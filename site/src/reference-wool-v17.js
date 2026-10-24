// Shared neutral-space color for the continuous surface and real yarn tubes.
// The supplied video calibrates trunk scale/color; the original photo anchors
// the face hood. Side and moving-neck detail use an isotropic wool projection.
export const referenceWoolGLSL = `
uniform sampler2D jollyPhoto,jollyVideo,jollyWool;
vec3 jollyLoopColor(vec3 p,vec3 n){
  vec3 w=pow(abs(normalize(n)),vec3(4.));
  w/=max(dot(w,vec3(1.)),.0001);
  p*=1.24;
  return texture2D(jollyWool,p.yz).rgb*w.x
       + texture2D(jollyWool,p.xz).rgb*w.y
       + texture2D(jollyWool,p.xy).rgb*w.z;
}
vec3 jollyWoolColor(vec3 rest,vec3 rootNormal,vec3 root,vec3 relaxed){
  vec3 n=normalize(rootNormal);
  vec2 photoUV=vec2(.5+rest.x*.1715,.137+rest.y*.309+.011*smoothstep(1.1,1.5,rest.y));
  vec2 videoUV=vec2(.505+rest.x*.201,.082+rest.y*.354);
  vec3 stillColor=texture2D(jollyPhoto,photoUV).rgb;
  vec3 videoColor=texture2D(jollyVideo,videoUV).rgb;
  vec3 loops=jollyLoopColor(rest,n);
  float trunk=1.-smoothstep(1.16,1.33,root.y);
  // The video calibrates the trunk tint gently; its compressed frame must not
  // replace the sharp still-photo fiber detail or bake a new dark chest band.
  vec3 source=mix(stillColor,videoColor,trunk*.16);
  float brightest=max(source.r,max(source.g,source.b));
  float darkest=min(source.r,min(source.g,source.b));
  float chroma=(brightest-darkest)/max(brightest,.001);
  source=mix(loops*.98,source,smoothstep(.065,.18,chroma));
  float front=smoothstep(.12,.66,n.z);
  front*=smoothstep(.105,.20,root.y)
        *mix(smoothstep(.055,.115,abs(root.x)),1.,smoothstep(.25,.38,root.y));
  // Keep the opening's nap continuous: the source photograph's smooth face
  // pixels must not make an exposed bare beige ring around the real face.
  vec2 opening=(root.xy-vec2(.009,1.62))/vec2(.405,.310);
  float q=pow(pow(abs(opening.x),2.15)+pow(abs(opening.y),2.15),1./2.15);
  float fringe=(1.-smoothstep(1.015,1.19,q))*smoothstep(.25,.39,root.z);
  float neck=smoothstep(1.015,1.085,root.y)*(1.-smoothstep(1.285,1.38,root.y));
  vec3 neckLoops=jollyLoopColor(relaxed,n);
  source=mix(source,loops,fringe*.92);
  source=mix(source,neckLoops,neck*.72);
  vec3 key=normalize(vec3(-3.,5.,4.));
  float sideLight=.80+.20*max(0.,dot(n,key));
  vec3 color=mix(loops*sideLight,source,front);
  float luminance=dot(color,vec3(.2126,.7152,.0722));
  color=mix(vec3(luminance),color,.91);
  return color*1.015;
}
`;

export function referenceUniforms({photo,video,wool}){
  return {jollyPhoto:{value:photo},jollyVideo:{value:video},jollyWool:{value:wool}};
}

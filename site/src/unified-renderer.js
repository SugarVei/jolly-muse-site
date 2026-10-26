// A single opaque scene: background, typography, floor, and character are
// resolved here before the browser receives a pixel. UI controls remain HTML.
export function createPoseRenderer(canvas){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,premultipliedAlpha:false,powerPreference:'default'});
  if(!gl){
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('当前浏览器无法显示 Jolly。');let backdrop=null;
    return {type:'Canvas2D opaque scene fallback',warping:false,opaque:true,backdropBytes:0,
      setBackdrop(value){backdrop=value;this.backdropBytes=value.width*value.height*4;},
      upload(bitmap,data=false){if(data){bitmap.close();return null;}return {bitmap,width:bitmap.width,height:bitmap.height};},
      release(item){item?.bitmap?.close();},finishReady(){},dispose(){backdrop=null;},
      draw(bank,flow,pose,rect,width,height,dpr,atlas){
        ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
        ctx.drawImage(backdrop,0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        const sx=pose.col%atlas.columns*bank.width,sy=Math.floor(pose.col/atlas.columns)*bank.height,cut=.54;
        ctx.drawImage(bank.items[pose.row].bitmap,sx,sy,bank.width,bank.height*cut,rect.x,rect.y,rect.w,rect.h*cut);
        ctx.drawImage(bank.items[2].bitmap,4*bank.width,bank.height*(1+cut),bank.width,bank.height*(1-cut),rect.x,rect.y+rect.h*cut,rect.w,rect.h*(1-cut));
      }};
  }
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const vertex=shader(gl.VERTEX_SHADER,`
    attribute vec2 position;varying vec2 screenUV;
    void main(){screenUV=position;gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0.,1.);}
  `);
  const fragment=shader(gl.FRAGMENT_SHADER,`
    precision highp float;
    uniform sampler2D colorImage;uniform sampler2D bodyImage;uniform sampler2D yawFlow;uniform sampler2D pitchFlow;uniform sampler2D backdrop;
    uniform vec4 rect;uniform vec2 viewport;uniform vec2 tile;uniform vec2 bodyTile;uniform vec2 pack;uniform vec2 delta;uniform vec2 nativeSize;uniform vec2 cellSize;uniform vec2 flowSize;
    varying vec2 screenUV;
    vec2 cellUV(vec2 point,vec2 size,vec2 cell){return (cell+clamp(point,1.5/size,1.-1.5/size))/pack;}
    vec2 displacement(vec2 point){
      vec4 x=texture2D(yawFlow,cellUV(point,flowSize,tile)),y=texture2D(pitchFlow,cellUV(point,flowSize,tile));
      vec2 dx=((delta.x<0.?x.rg:x.ba)*255.-128.)*.5,dy=((delta.y<0.?y.rg:y.ba)*255.-128.)*.5;
      // The torso does not follow the pointer. Do not stretch its fine fleece.
      return (dx*abs(delta.x)+dy*abs(delta.y))/nativeSize*(1.-smoothstep(.43,.54,point.y));
    }
    // Catmull-Rom reconstruction: nine bilinear taps retain fine fleece at
    // fractional coordinates, without switching filters when motion stops.
    vec4 sharp(sampler2D source,vec2 point,vec2 cell){
      vec2 size=cellSize*pack,p=cellUV(point,cellSize,cell)*size-.5,base=floor(p),f=p-base;
      vec2 w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f);
      vec2 middle=w1+w2,a=(base-.5)/size,b=(base+.5+w2/middle)/size,c=(base+2.5)/size;
      vec4 color=texture2D(source,vec2(a.x,a.y))*w0.x*w0.y+texture2D(source,vec2(b.x,a.y))*middle.x*w0.y+texture2D(source,vec2(c.x,a.y))*w3.x*w0.y
        +texture2D(source,vec2(a.x,b.y))*w0.x*middle.y+texture2D(source,vec2(b.x,b.y))*middle.x*middle.y+texture2D(source,vec2(c.x,b.y))*w3.x*middle.y
        +texture2D(source,vec2(a.x,c.y))*w0.x*w3.y+texture2D(source,vec2(b.x,c.y))*middle.x*w3.y+texture2D(source,vec2(c.x,c.y))*w3.x*w3.y;
      // Color textures are premultiplied before filtering, so silhouettes do
      // not acquire a dark fringe from transparent texels.
      color.a=clamp(color.a,0.,1.);color.rgb=clamp(color.rgb,vec3(0.),vec3(color.a));return color;
    }
    void main(){
      vec3 paper=texture2D(backdrop,screenUV).rgb;vec2 uv=(screenUV*viewport-rect.xy)/rect.zw;
      if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))){gl_FragColor=vec4(paper,1.);return;}
      vec4 color;
      if(uv.y>=.56){color=sharp(bodyImage,uv,bodyTile);}
      else{
        vec2 source=uv;for(int i=0;i<4;i++){source=uv-displacement(source);}
        color=sharp(colorImage,source,tile);
        if(uv.y>.50)color=mix(color,sharp(bodyImage,uv,bodyTile),smoothstep(.50,.56,uv.y));
      }
      gl_FragColor=vec4(color.rgb+paper*(1.-color.a),1.);
    }
  `);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const uniforms=Object.fromEntries(['rect','viewport','tile','bodyTile','pack','delta','nativeSize','cellSize','flowSize','colorImage','yawFlow','pitchFlow','bodyImage','backdrop'].map(n=>[n,gl.getUniformLocation(program,n)]));
  for(const [name,unit] of [['colorImage',0],['yawFlow',1],['pitchFlow',2],['bodyImage',3],['backdrop',4]])gl.uniform1i(uniforms[name],unit);
  gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);let setting=null;
  function upload(source,close=false){
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    const item={texture,width:source.width,height:source.height};if(close)source.close();
    if(gl.getError()!==gl.NO_ERROR){gl.deleteTexture(texture);throw new Error('画面资源未能完整上传，请尝试流畅画质。');}return item;
  }
  return {type:'WebGL unified opaque scene',warping:true,opaque:true,backdropBytes:0,
    setBackdrop(value){const next=upload(value);if(setting)gl.deleteTexture(setting.texture);setting=next;this.backdropBytes=value.width*value.height*4;},
    upload(bitmap){return upload(bitmap,true);},
    release(item){if(item?.texture)gl.deleteTexture(item.texture);},
    // Finish initial texture uploads and shader compilation before enabling
    // pointer controls. Never block on the GPU during normal interaction.
    finishReady(){gl.finish();},
    draw(bank,flows,pose,rect,width,height,dpr,atlas){
      gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
      for(const [unit,item] of [[0,bank.items[pose.row]],[1,flows[pose.row][0]],[2,flows[pose.row][1]],[3,bank.items[2]],[4,setting]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,item.texture);}
      gl.uniform4f(uniforms.rect,rect.x,rect.y,rect.w,rect.h);gl.uniform2f(uniforms.viewport,width,height);
      gl.uniform2f(uniforms.tile,pose.col%atlas.columns,Math.floor(pose.col/atlas.columns));gl.uniform2f(uniforms.bodyTile,4,1);gl.uniform2f(uniforms.pack,atlas.columns,atlas.rows);
      gl.uniform2f(uniforms.delta,pose.dx,pose.dy);gl.uniform2f(uniforms.nativeSize,atlas.width,atlas.height);gl.uniform2f(uniforms.cellSize,bank.width,bank.height);gl.uniform2f(uniforms.flowSize,atlas.flowWidth,atlas.flowHeight);
      gl.drawArrays(gl.TRIANGLES,0,6);
    },
    dispose(){if(setting)gl.deleteTexture(setting.texture);gl.deleteBuffer(vertices);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);}
  };
}

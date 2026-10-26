// One color source per output pixel. Displacement moves the features into place;
// unrelated faces are never composited, even at diagonal or half-grid poses.
export function createPoseRenderer(canvas){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true,powerPreference:'default'});
  if(!gl){
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw new Error('当前浏览器无法显示 Jolly。');
    return {type:'Canvas2D single-pose fallback',warping:false,
      upload(bitmap,data=false){if(data){bitmap.close();return null;}return {bitmap,width:bitmap.width,height:bitmap.height};},
      release(item){item?.bitmap?.close();},dispose(){},
      draw(bank,flow,pose,rect,width,height,dpr,atlas){
        ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(bank.items[pose.row].bitmap,(pose.col%atlas.columns)*bank.width,Math.floor(pose.col/atlas.columns)*bank.height,bank.width,bank.height,rect.x,rect.y,rect.w,rect.h);
      }};
  }
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const vertex=shader(gl.VERTEX_SHADER,`
    attribute vec2 position;uniform vec4 rect;uniform vec2 viewport;varying vec2 uv;
    void main(){uv=position;vec2 pixel=rect.xy+position*rect.zw;gl_Position=vec4(pixel.x/viewport.x*2.-1.,1.-pixel.y/viewport.y*2.,0.,1.);}
  `);
  const fragment=shader(gl.FRAGMENT_SHADER,`
    precision highp float;
    uniform sampler2D colorImage;uniform sampler2D yawFlow;uniform sampler2D pitchFlow;
    uniform vec2 tile;uniform vec2 pack;uniform vec2 delta;uniform vec2 nativeSize;uniform vec2 cellSize;uniform vec2 flowSize;
    varying vec2 uv;
    vec2 cellUV(vec2 point,vec2 size){return (tile+clamp(point,.5/size,1.-.5/size))/pack;}
    vec2 displacement(vec2 point){
      vec4 x=texture2D(yawFlow,cellUV(point,flowSize));vec4 y=texture2D(pitchFlow,cellUV(point,flowSize));
      vec2 dx=((delta.x<0.?x.rg:x.ba)*255.-128.)*.5;
      vec2 dy=((delta.y<0.?y.rg:y.ba)*255.-128.)*.5;
      return (dx*abs(delta.x)+dy*abs(delta.y))/nativeSize;
    }
    void main(){
      vec2 source=uv;
      for(int i=0;i<4;i++){source=uv-displacement(source);}
      if(any(lessThan(source,vec2(0.)))||any(greaterThan(source,vec2(1.)))){gl_FragColor=vec4(0.);return;}
      vec4 color=texture2D(colorImage,cellUV(source,cellSize));
      gl_FragColor=vec4(color.rgb*color.a,color.a);
    }
  `);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const uniforms=Object.fromEntries(['rect','viewport','tile','pack','delta','nativeSize','cellSize','flowSize','colorImage','yawFlow','pitchFlow'].map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform1i(uniforms.colorImage,0);gl.uniform1i(uniforms.yawFlow,1);gl.uniform1i(uniforms.pitchFlow,2);
  gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  return {type:'WebGL single-pose displacement',warping:true,
    upload(bitmap){
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
      const item={texture,width:bitmap.width,height:bitmap.height};bitmap.close();
      if(gl.getError()!==gl.NO_ERROR){gl.deleteTexture(texture);throw new Error('画面资源未能完整上传，请尝试流畅画质。');}
      return item;
    },
    release(item){if(item?.texture)gl.deleteTexture(item.texture);},
    draw(bank,flows,pose,rect,width,height,dpr,atlas){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
      for(const [unit,item] of [[0,bank.items[pose.row]],[1,flows[pose.row][0]],[2,flows[pose.row][1]]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,item.texture);}
      gl.uniform4f(uniforms.rect,rect.x,rect.y,rect.w,rect.h);gl.uniform2f(uniforms.viewport,width,height);
      gl.uniform2f(uniforms.tile,pose.col%atlas.columns,Math.floor(pose.col/atlas.columns));gl.uniform2f(uniforms.pack,atlas.columns,atlas.rows);
      gl.uniform2f(uniforms.delta,pose.dx,pose.dy);gl.uniform2f(uniforms.nativeSize,atlas.width,atlas.height);
      gl.uniform2f(uniforms.cellSize,bank.width,bank.height);gl.uniform2f(uniforms.flowSize,atlas.flowWidth,atlas.flowHeight);
      gl.drawArrays(gl.TRIANGLES,0,6);
    },
    dispose(){gl.deleteBuffer(vertices);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);}
  };
}

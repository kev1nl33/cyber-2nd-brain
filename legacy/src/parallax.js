/**
 * 景深视差。平移量来自相机（屏幕像素），三层按深度打折：
 * 星空 0.3、流星 0.6、节点 1。缩放不参与——节点的缩放已经由相机自己处理。
 * reduced-motion 下背景两层固定在屏幕上，节点层照常跟随。
 */

const FACTOR = { stars: 0.3, meteors: 0.6, nodes: 1 };

/**
 * @param {{ dx?: number, dy?: number }|null} pan 相对静止点的屏幕平移
 * @param {{ reduced?: boolean, scale?: number }} [options] scale 只为证明缩放不影响视差，不参与计算
 * @returns {{ stars: {x:number,y:number}, meteors: {x:number,y:number}, nodes: {x:number,y:number} }}
 */
export function parallaxShift(pan, { reduced = false } = {}) {
  const dx = Number(pan?.dx) || 0;
  const dy = Number(pan?.dy) || 0;
  const shift = (factor) => ({ x: dx * factor || 0, y: dy * factor || 0 });
  return {
    stars: shift(reduced ? 0 : FACTOR.stars),
    meteors: shift(reduced ? 0 : FACTOR.meteors),
    nodes: shift(FACTOR.nodes),
  };
}

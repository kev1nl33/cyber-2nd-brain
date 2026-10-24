/**
 * Opening sequence: digits and motes spiral inward while a large brain draws
 * itself, then shrinks toward the place the core brain will occupy. Skippable,
 * and skipped entirely when motion is off.
 */
import { brainArt } from "./anatomy.js";

const DURATION = 3400;
const LEAVE = 420;

/**
 * @param {{ overlay: HTMLElement, svg: SVGElement, skipBtn: HTMLElement, background: { setMode: (m:string)=>void }, motion: boolean }} options
 * @returns {Promise<void>}
 */
export function runIntro({ overlay, svg, skipBtn, background, motion }) {
  if (!motion) {
    overlay.hidden = true;
    return Promise.resolve();
  }

  svg.innerHTML = brainArt({ seed: "core", detail: "core" });
  for (const p of svg.querySelectorAll("path")) p.setAttribute("pathLength", "100");

  overlay.hidden = false;
  background.setMode("intro");
  requestAnimationFrame(() => overlay.classList.add("is-running"));

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      skipBtn.removeEventListener("click", finish);
      window.removeEventListener("keydown", onKey);
      overlay.removeEventListener("click", finish);
      overlay.classList.add("is-leaving");
      background.setMode("idle");
      setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove("is-running", "is-leaving");
        resolve();
      }, LEAVE);
    };
    const onKey = (event) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") finish();
    };
    const timer = setTimeout(finish, DURATION);
    skipBtn.addEventListener("click", finish);
    overlay.addEventListener("click", finish);
    window.addEventListener("keydown", onKey);
  });
}

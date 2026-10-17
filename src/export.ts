import { VIEW_WIDTH, VIEW_HEIGHT } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function cloneForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', VIEW_WIDTH.toString());
  clone.setAttribute('height', VIEW_HEIGHT.toString());
  clone.removeAttribute('class');
  clone.removeAttribute('data-mode');
  clone.removeAttribute('style');
  return clone;
}

export function getSvgMarkup(svg: SVGSVGElement): string {
  const clone = cloneForExport(svg);
  const markup = new XMLSerializer().serializeToString(clone);
  return '<?xml version=' + String.fromCharCode(34) + '1.0' + String.fromCharCode(34) +
    ' encoding=' + String.fromCharCode(34) + 'UTF-8' + String.fromCharCode(34) + '?>\n' + markup;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg: SVGSVGElement, filename = 'graph.svg'): void {
  const markup = getSvgMarkup(svg);
  downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export function downloadPng(svg: SVGSVGElement, scale: number, filename = 'graph.png'): Promise<void> {
  const markup = getSvgMarkup(svg);
  const svgBlob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(VIEW_WIDTH * scale);
      canvas.height = Math.round(VIEW_HEIGHT * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas is not available in this browser.'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('The PNG encoder returned an empty image.'));
          return;
        }
        downloadBlob(blob, filename);
        resolve();
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not convert the graph to PNG.'));
    };
    image.src = url;
  });
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

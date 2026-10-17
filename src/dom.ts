export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export interface SegmentedControl {
  root: HTMLDivElement;
  setActive: (value: string) => void;
}

export function createSegmented(
  options: string[],
  active: string,
  onSelect: (value: string) => void,
  className = '',
): SegmentedControl {
  const root = el('div', 'segmented' + (className ? ' ' + className : ''));
  root.setAttribute('role', 'group');
  const buttons = new Map<string, HTMLButtonElement>();
  for (const option of options) {
    const button = el('button', 'segment', option);
    button.type = 'button';
    button.setAttribute('aria-pressed', option === active ? 'true' : 'false');
    button.classList.toggle('is-active', option === active);
    button.addEventListener('click', () => {
      onSelect(option);
    });
    buttons.set(option, button);
    root.appendChild(button);
  }
  return {
    root,
    setActive: (value: string) => {
      for (const [option, button] of buttons) {
        const selected = option === value;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
    },
  };
}

export function makeLabel(text: string, htmlFor?: string): HTMLLabelElement {
  const label = el('label', 'field-label', text);
  if (htmlFor) {
    label.htmlFor = htmlFor;
  }
  return label;
}

export function makeField(title: string, control: HTMLElement, help?: string): HTMLDivElement {
  const wrapper = el('div', 'field-block');
  wrapper.appendChild(makeLabel(title));
  wrapper.appendChild(control);
  if (help) {
    wrapper.appendChild(el('div', 'field-help', help));
  }
  return wrapper;
}

export function makeRange(
  id: string,
  min: number,
  max: number,
  value: number,
  onChange: (value: number) => void,
): { wrapper: HTMLDivElement; input: HTMLInputElement; output: HTMLOutputElement } {
  const wrapper = el('div', 'range-row');
  const input = el('input', 'range-input');
  input.type = 'range';
  input.id = id;
  input.min = min.toString();
  input.max = max.toString();
  input.value = value.toString();
  const output = el('output', 'range-output', value.toString());
  output.htmlFor = id;
  input.addEventListener('input', () => {
    output.textContent = input.value;
  });
  input.addEventListener('change', () => {
    onChange(Number(input.value));
  });
  wrapper.appendChild(input);
  wrapper.appendChild(output);
  return { wrapper, input, output };
}

export function makeSelect(
  id: string,
  options: readonly string[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = el('select', 'select-input');
  select.id = id;
  for (const option of options) {
    const item = el('option', undefined, option);
    item.value = option;
    if (option === value) {
      item.selected = true;
    }
    select.appendChild(item);
  }
  select.addEventListener('change', () => {
    onChange(select.value);
  });
  return select;
}

export function createToastRoot(): HTMLDivElement {
  const root = el('div', 'toast-root');
  root.setAttribute('aria-live', 'polite');
  return root;
}

export function showToast(root: HTMLElement, message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  const toast = el('div', 'toast toast-' + kind, message);
  root.appendChild(toast);
  window.requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

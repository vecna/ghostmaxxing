/** @module ghostyle-player/parameters */
import { colorValue } from './catalog.js';

/**
 * Builds the matching form control for one Ghostyle parameter.
 * @param {object} parameter Descriptor exported by the Ghostyle.
 * @param {*} value Current parameter value.
 * @returns {object|null} Input with a typed reader, or null for unsupported parameters.
 */
function parameterInput(parameter, value) {
   const input = document.createElement(parameter.type === 'select' ? 'select' : 'input');
   switch (parameter.type) {
      case 'range':
         input.type = 'range';
         for (const attribute of ['min', 'max', 'step']) {
            if (Number.isFinite(parameter[attribute])) input[attribute] = parameter[attribute];
         }
         if (!input.step) input.step = 'any';
         input.value = value;
         return { input, read: () => input.valueAsNumber };
      case 'bool':
         input.type = 'checkbox';
         input.checked = Boolean(value);
         return { input, read: () => input.checked };
      case 'color':
         input.type = 'color';
         input.value = '#' + colorValue(value).map(channel => channel.toString(16).padStart(2, '0')).join('');
         return { input, read: () => colorValue(input.value) };
      case 'select': {
         const options = parameter.options ?? [];
         for (const [index, option] of options.entries()) input.add(new Option(String(option), String(index)));
         input.selectedIndex = Math.max(0, options.indexOf(value));
         return { input, read: () => options[input.selectedIndex] };
      }
      default:
         return null;
   }
}

/**
 * Shows the active Ghostyle's declared controls directly above the player bar.
 * @param {HTMLElement} area Container for the active controls.
 * @param {object[]} definitions The active Ghostyle's parameter descriptors.
 * @param {object} values The current values keyed by parameter name.
 * @param {Function} change Called with a parameter name and its updated value.
 * @returns {void}
 */
export function showParameterControls(area, definitions, values, change) {
   area.replaceChildren();
   for (const parameter of definitions) {
      if (!parameter?.name) continue;
      const control = parameterInput(parameter, values[parameter.name]);
      if (!control) continue;
      const { input, read } = control;
      const label = document.createElement('label');
      label.className = 'player-parameter';
      label.textContent = parameter.label || parameter.name;
      label.append(input);

      const amount = parameter.type === 'range' ? document.createElement('span') : null;
      if (amount) {
         amount.className = 'player-parameter-value';
         amount.textContent = input.value;
         label.append(amount);
      }
      input.addEventListener('input', () => {
         if (amount) amount.textContent = input.value;
         change(parameter.name, read());
      });
      area.append(label);
   }
   area.hidden = !area.childElementCount;
}

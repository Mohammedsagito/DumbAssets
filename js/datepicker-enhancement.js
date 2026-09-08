/**
 * Date Picker Enhancement
 * Improves the user experience of date inputs
 */

document.addEventListener('DOMContentLoaded', () => {
    // Find all date inputs
    const dateInputs = document.querySelectorAll('input[type="date"]');

    dateInputs.forEach(input => {
        // Add clear button functionality
        addClearButton(input);
        
        // Add data-has-value attribute for styling
        input.addEventListener('change', () => {
            if (input.value) {
                input.setAttribute('data-has-value', 'true');
            } else {
                input.removeAttribute('data-has-value');
            }
        });

        // Initialize with current state
        if (input.value) {
            input.setAttribute('data-has-value', 'true');
        }
    });
});

/**
 * Adds a clear button to a date input
 * @param {HTMLInputElement} input - The date input element
 */
function addClearButton(input) {
    const wrapper = document.createElement('div');
    wrapper.className = 'date-input-wrapper';
    
    // Insert the wrapper before the input
    input.parentNode.insertBefore(wrapper, input);
    
    // Move the input inside the wrapper
    wrapper.appendChild(input);
    
    // Create clear button
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'date-clear-btn';
    clearButton.innerHTML = '×';
    clearButton.title = 'Clear date';
    clearButton.style.display = input.value ? 'block' : 'none';
    
    // Add event listener to clear button
    clearButton.addEventListener('click', (e) => {
        e.preventDefault();
        input.value = '';
        clearButton.style.display = 'none';
        input.removeAttribute('data-has-value');
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    // Add event listener to input to show/hide clear button
    input.addEventListener('change', () => {
        clearButton.style.display = input.value ? 'block' : 'none';
    });
    
    // Add the clear button to the wrapper
    wrapper.appendChild(clearButton);
}

export async function replaceMark(texte:string, container:HTMLElement) {
    if (texte !== null) {
        texte.split(/(<mark>.*?<\/mark>)/g).forEach(segment => {
            if (segment.startsWith('<mark>')) {
                // Create <mark> element for each <mark> tag
                const markEl = document.createElement('mark');
                markEl.textContent = segment.replace(/<\/?mark>/g, ''); // Remove <mark> tags
                container.appendChild(markEl);
            } else {
                // Append non-marked text segments directly
                const textNode = document.createTextNode(segment);
                container.appendChild(textNode);
            }
        });
    }
    return container
}

export function removeTags(str:string) {

    if ((str === null) || (str === ''))
        return '';
    else
        str = str.toString();
 
    // Regular expression to identify HTML tags in
    // the input string. Replacing the identified
    // HTML tag with a null string.
    return str.replace(/(<([^>]+)>)/ig, '');
}
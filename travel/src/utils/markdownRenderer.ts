/**
 * Lightweight, zero-dependency Markdown to HTML parser
 * Supports: Headers (#), Bold (**), Italic (*), Lists (-), Task Checkboxes ([ ]), Callout Blocks (>), GFM Tables (|), Images (![alt](url)), Links, and raw HTML.
 */

interface ListItem {
  indent: number;
  type: 'ol' | 'ul';
  content: string;
}

function renderNestedList(items: ListItem[]): string {
  if (items.length === 0) return '';

  let html = '';
  const stack: { indent: number; type: 'ol' | 'ul' }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    while (stack.length > 0 && stack[stack.length - 1].indent > item.indent) {
      const closed = stack.pop()!;
      html += `</li></${closed.type}>`;
    }

    if (stack.length === 0 || stack[stack.length - 1].indent < item.indent) {
      html += `<${item.type}><li>${item.content}`;
      stack.push({ indent: item.indent, type: item.type });
    } else if (stack[stack.length - 1].indent === item.indent) {
      if (stack[stack.length - 1].type !== item.type) {
        const closed = stack.pop()!;
        html += `</li></${closed.type}><${item.type}><li>${item.content}`;
        stack.push({ indent: item.indent, type: item.type });
      } else {
        html += `</li>\n<li>${item.content}`;
      }
    }
  }

  while (stack.length > 0) {
    const closed = stack.pop()!;
    html += `</li></${closed.type}>`;
  }

  return html;
}

function parseListsInMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  const listRegex = /^(\s*)(\d+\.|[-\*]|\[[ xX]\]|[-\*]\s*\[[ xX]\])\s+(.*)$/;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(listRegex);

    if (match) {
      const blockItems: ListItem[] = [];
      while (i < lines.length) {
        const lineTrim = lines[i].trim();
        const itemMatch = lines[i].match(listRegex);

        if (itemMatch) {
          const indent = itemMatch[1].length;
          const marker = itemMatch[2];
          let type: 'ol' | 'ul' = 'ul';
          let content = itemMatch[3];

          if (marker.includes('[x]') || marker.includes('[X]')) {
            content = `<input type="checkbox" class="task-checkbox" checked disabled /> ${content}`;
          } else if (marker.includes('[ ]')) {
            content = `<input type="checkbox" class="task-checkbox" disabled /> ${content}`;
          } else if (/^\d+\./.test(marker)) {
            type = 'ol';
          }

          blockItems.push({ indent, type, content });
          i++;
        } else if (lineTrim === '') {
          // Check lookahead for next non-empty line to keep contiguous list sequence
          let nextIdx = i + 1;
          while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
            nextIdx++;
          }
          if (nextIdx < lines.length) {
            const nextLine = lines[nextIdx];
            const nextTrim = nextLine.trim();
            const isNextListItem = listRegex.test(nextLine);
            const isNextIndented =
              nextTrim !== '' &&
              nextLine.search(/\S/) > (blockItems.length > 0 ? blockItems[blockItems.length - 1].indent : 0);
            const isHeaderOrTableOrBox =
              nextTrim.startsWith('#') || nextTrim.startsWith('|') || nextTrim.startsWith('<div');

            if ((isNextListItem || isNextIndented) && !isHeaderOrTableOrBox) {
              i++;
              continue;
            }
          }
          break;
        } else {
          // Continuation line (indented text under list item)
          if (
            blockItems.length > 0 &&
            lineTrim !== '' &&
            lines[i].search(/\S/) > blockItems[blockItems.length - 1].indent &&
            !lineTrim.startsWith('<div') &&
            !lineTrim.startsWith('>')
          ) {
            blockItems[blockItems.length - 1].content += ' <br> ' + lineTrim;
            i++;
          } else {
            break;
          }
        }
      }

      output.push(renderNestedList(blockItems));
    } else {
      output.push(line);
      i++;
    }
  }

  return output.join('\n');
}

export function renderMarkdown(markdown: string): string {
  if (!markdown) return "";

  let html = markdown.trim();

  // 1. Convert GFM Markdown Tables (| Header | Header |\n| :---: | :---: |\n| Cell | Cell |)
  const tableRegex = /^\|(.+)\|\s*\n\|([-:\s|]+)\|\s*\n((\|.+\|\s*\n?)+)/gm;
  html = html.replace(tableRegex, (_match, headerRow, alignRow, bodyRows) => {
    const headers = headerRow.split('|').map((h: string) => h.trim()).filter((h: string) => h !== '');
    const aligns = alignRow.split('|').map((a: string) => a.trim()).filter((a: string) => a !== '').map((a: string) => {
      if (a.startsWith(':') && a.endsWith(':')) return 'style="text-align: center;"';
      if (a.endsWith(':')) return 'style="text-align: right;"';
      if (a.startsWith(':')) return 'style="text-align: left;"';
      return '';
    });

    const headerHtml = `<thead><tr>${headers.map((h: string, i: number) => {
      const alignAttr = aligns[i] ? ` ${aligns[i]}` : '';
      return `<th${alignAttr}>${h}</th>`;
    }).join('')}</tr></thead>`;

    const rows = bodyRows.trim().split('\n');
    const bodyHtml = `<tbody>${rows.map((row: string) => {
      const cells = row.split('|').map((c: string) => c.trim());
      if (cells.length > 0 && cells[0] === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();

      return `<tr>${cells.map((c: string, i: number) => {
        const alignAttr = aligns[i] ? ` ${aligns[i]}` : '';
        return `<td${alignAttr}>${c}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody>`;

    return `<div class="table-responsive-wrapper"><table class="field-rosetta-table">${headerHtml}${bodyHtml}</table></div>`;
  });

  // Ensure any raw <table ...> tag automatically receives the wrapper and field-rosetta-table class
  html = html.replace(/<table(\s[^>]*)?>/gi, (_match, attrs) => {
    const existingAttrs = attrs || '';
    if (!existingAttrs.includes('field-rosetta-table')) {
      return `<div class="table-responsive-wrapper"><table class="field-rosetta-table"${existingAttrs}>`;
    }
    return `<div class="table-responsive-wrapper"><table${existingAttrs}>`;
  });
  html = html.replace(/<\/table>/gi, '</table></div>');

  // 2. Callout boxes (consecutive lines starting with optional spaces and '>')
  html = html.replace(/((?:^\s*>.*\n?)+)/gm, (block) => {
    const lines = block.split('\n');
    const cleanedLines = lines
      .map(line => line.replace(/^\s*>\s?/, ''))
      .filter((line, i) => !(i === lines.length - 1 && line.trim() === ''));

    // Process lines inside callout box
    let innerContent = cleanedLines.map(l => {
      const trimmed = l.trim();
      if (!trimmed) return '<br>';
      if (trimmed.startsWith('<') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
        return trimmed;
      }
      return trimmed + '<br>';
    }).join('\n');

    // Parse list items inside callout box if present
    innerContent = parseListsInMarkdown(innerContent);

    return `<div class="field-callout-box">${innerContent}</div>\n`;
  });

  // Standalone callout lines starting with bold labels
  html = html.replace(/^(\*\*(?:Fun Fact|Field Tip|Note|Warning|Tip):?\*\*.*)$/gm, '<div class="field-callout-box">$1</div>');

  // 3. Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // 4. Parse Lists with nesting, checkbox & lookahead support
  html = parseListsInMarkdown(html);

  // 5. Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 6. Convert Images: ![Alt Text](URL)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const src = url.trim();
    return `<a href="${src}" target="_blank" rel="noopener noreferrer" class="markdown-img-link"><img src="${src}" alt="${alt.trim()}" class="markdown-img" /></a>`;
  });

  // 7. Convert Links: [Text](URL) or [Text][#anchor]
  html = html.replace(/\[([^\]]+)\][\(\[]([^\]\)]+)[\)\]]/g, (_match, text, url) => {
    let target = url.trim();
    if (target.startsWith('#') && !target.startsWith('#section-')) {
      target = '#section-' + target.substring(1);
    }
    return `<a href="${target}" class="markdown-link">${text}</a>`;
  });

  // 8. Paragraphs for plain lines
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<') || trimmed.startsWith('#') || trimmed.startsWith('|')) {
      return trimmed;
    }
    return `<p>${trimmed}</p>`;
  });

  return processedLines.join('\n');
}

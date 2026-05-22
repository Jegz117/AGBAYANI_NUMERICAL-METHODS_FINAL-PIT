const pointRows = document.getElementById('pointRows');
const targetX = document.getElementById('targetX');
const errorBox = document.getElementById('errorBox');
const resultValue = document.getElementById('resultValue');
const polynomialText = document.getElementById('polynomialText');
const stepCards = document.getElementById('stepCards');
const fullSolution = document.getElementById('fullSolution');
const modeBadge = document.getElementById('modeBadge');
const warningBadge = document.getElementById('warningBadge');
const rangeNote = document.getElementById('rangeNote');
const autoCalculate = document.getElementById('autoCalculate');
let latestData = null;
let debounceTimer = null;

const presets = {
  example1: { points: [[0, 2], [1, 3], [2, 6]], target: 1.5 },
  example2: { points: [[-1, 4], [0, 1], [2, 3], [3, 10]], target: 1 },
};

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (Math.abs(number) < 1e-12) return '0';
  if (Number.isInteger(number)) return String(number);
  return Number.parseFloat(number.toFixed(4)).toString();
}

function latexNumber(value) {
  return formatNumber(value);
}

function latexSignedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number < 0 ? `(${formatNumber(number)})` : formatNumber(number);
}

function latexDifference(left, right) {
  return `${latexNumber(left)}-${latexSignedNumber(right)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function addRow(x = '', y = '', shouldCalculate = true) {
  if (pointRows.querySelectorAll('tr').length >= 12) {
    showError('Maximum of 12 points only for clarity and stability.');
    return;
  }

  const tr = document.createElement('tr');
  tr.className = 'point-row';
  tr.innerHTML = `
    <td class="row-number"></td>
    <td><input class="x-input" type="number" step="any" value="${escapeHtml(x)}" aria-label="x value"></td>
    <td><input class="y-input" type="number" step="any" value="${escapeHtml(y)}" aria-label="y value"></td>
    <td><button class="remove-row" type="button" aria-label="Remove point">Remove</button></td>
  `;

  tr.querySelector('.remove-row').addEventListener('click', () => {
    tr.remove();
    refreshRowNumbers();
    queueCalculation();
  });

  tr.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', queueCalculation);
  });

  pointRows.appendChild(tr);
  refreshRowNumbers();
  if (shouldCalculate) queueCalculation();
}

function refreshRowNumbers() {
  [...pointRows.querySelectorAll('tr')].forEach((row, index) => {
    row.querySelector('.row-number').textContent = index + 1;
  });
}

function setRows(points, target, shouldCalculate = true) {
  pointRows.innerHTML = '';
  points.forEach(([x, y]) => addRow(x, y, false));
  targetX.value = target;
  refreshRowNumbers();
  if (shouldCalculate) queueCalculation(0);
}

function getInputPayload() {
  const rows = [...pointRows.querySelectorAll('tr')];
  return {
    points: rows.map(row => ({
      x: row.querySelector('.x-input').value,
      y: row.querySelector('.y-input').value,
    })),
    targetX: targetX.value,
  };
}

function hasReadyInput() {
  const payload = getInputPayload();
  if (String(payload.targetX).trim() === '') return false;
  const completedPoints = payload.points.filter(point => (
    String(point.x).trim() !== '' && String(point.y).trim() !== ''
  ));
  return completedPoints.length >= 2 && completedPoints.length === payload.points.length;
}

function resetOutputState() {
  latestData = null;
  resultValue.textContent = 'No calculation yet';
  polynomialText.textContent = 'Enter at least two points and a target x. Auto-calculate is already enabled.';
  rangeNote.textContent = '';
  warningBadge.classList.add('hidden');
  fullSolution.textContent = 'No solution generated yet.';
  stepCards.innerHTML = '';
  if (document.getElementById('plot')) Plotly.purge('plot');
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

function queueCalculation(delay = 450) {
  clearTimeout(debounceTimer);
  if (!autoCalculate.checked) return;
  clearError();
  if (!hasReadyInput()) {
    resetOutputState();
    return;
  }
  debounceTimer = setTimeout(calculate, delay);
}

async function calculate() {
  clearError();
  try {
    const response = await fetch('/api/lagrange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getInputPayload()),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || 'Calculation failed.');
    latestData = payload.data;
    renderResult(latestData);
  } catch (error) {
    showError(error.message);
  }
}

function renderResult(data) {
  const minX = Math.min(...data.points.map(point => point.x));
  const maxX = Math.max(...data.points.map(point => point.x));
  modeBadge.textContent = `${data.mode} • Degree ${data.degree}`;
  resultValue.textContent = `P(${formatNumber(data.targetX)}) = ${formatNumber(data.result)}`;
  polynomialText.textContent = data.polynomialText;
  rangeNote.textContent = `Data range: ${formatNumber(minX)} ≤ x ≤ ${formatNumber(maxX)}. ${data.warning || ''}`;
  warningBadge.classList.toggle('hidden', data.mode !== 'Extrapolation');
  renderSteps(data);
  renderFullSolution(data);
  renderPlot(data);
}


function chunkLatexTerms(terms, perLine = 2) {
  const lines = [];
  for (let index = 0; index < terms.length; index += perLine) {
    const chunk = terms.slice(index, index + perLine).join(' + ');
    lines.push((index === 0 ? '' : '+ ') + chunk);
  }
  return lines;
}

function alignedLatexSum(leftSide, terms, perLine = 2) {
  const lines = chunkLatexTerms(terms, perLine);
  if (!lines.length) return `${leftSide}=0`;
  return `\\begin{aligned}${leftSide} &= ${lines.join(' \\\\ &') }\\end{aligned}`;
}

function renderSteps(data) {
  stepCards.innerHTML = '';
  const target = formatNumber(data.targetX);

  data.steps.forEach(step => {
    const numeratorFactors = step.targetFactors
      .map(factor => `(${latexDifference(data.targetX, factor.xj)})`)
      .join(' \\cdot ');
    const denominatorFactors = step.targetFactors
      .map(factor => `(${latexDifference(step.xk, factor.xj)})`)
      .join(' \\cdot ');
    const numeratorValues = step.targetFactors
      .map(factor => latexSignedNumber(factor.numeratorFactor))
      .join(' \\cdot ');
    const denominatorValues = step.targetFactors
      .map(factor => latexSignedNumber(factor.denominatorFactor))
      .join(' \\cdot ');
    const symbolicNumerator = step.targetFactors
      .map(factor => `(x-${latexSignedNumber(factor.xj)})`)
      .join('');
    const symbolicDenominator = step.targetFactors
      .map(factor => `(${latexDifference(step.xk, factor.xj)})`)
      .join(' \\cdot ');

    const factors = step.targetFactors.map(factor => `
      <tr>
        <td>\(j = ${factor.j}\)</td>
        <td>\(${latexDifference(data.targetX, factor.xj)} = ${latexNumber(factor.numeratorFactor)}\)</td>
        <td>\(${latexDifference(step.xk, factor.xj)} = ${latexNumber(factor.denominatorFactor)}\)</td>
      </tr>
    `).join('');

    const card = document.createElement('article');
    card.className = 'step-card math-step-card';
    card.innerHTML = String.raw`
      <h4><span>Basis \(L_{${step.k}}(x)\)</span><span>\(y_{${step.k}}=${latexNumber(step.yk)}\)</span></h4>
      <p class="basis-point">Using point \((x_{${step.k}}, y_{${step.k}})=(${latexNumber(step.xk)}, ${latexNumber(step.yk)})\)</p>

      <div class="step-subsection">
        <strong>1. Write the basis formula</strong>
        <div class="math-line">
          \[
            L_{${step.k}}(x)=\frac{${symbolicNumerator}}{${symbolicDenominator}}
          \]
        </div>
      </div>

      <div class="step-subsection">
        <strong>2. Substitute \(x = ${target}\)</strong>
        <div class="math-line">
          \[
            L_{${step.k}}(${target})=\frac{${numeratorFactors}}{${denominatorFactors}}
          \]
          \[
            L_{${step.k}}(${target})=\frac{${numeratorValues}}{${denominatorValues}}
          \]
        </div>
        <table class="factor-table compact-factor-table">
          <thead>
            <tr><th>Factor</th><th>Numerator</th><th>Denominator</th></tr>
          </thead>
          <tbody>${factors}</tbody>
        </table>
      </div>

      <div class="step-subsection">
        <strong>3. Compute the basis value</strong>
        <div class="math-line">
          \[
            L_{${step.k}}(${target})=\frac{${latexNumber(step.numeratorAtTarget)}}{${latexNumber(step.denominator)}}=${latexNumber(step.basisValue)}
          \]
        </div>
      </div>

      <div class="contribution-box math-contribution">
        \[
          y_{${step.k}}L_{${step.k}}(${target})=${latexNumber(step.yk)}\left(${latexNumber(step.basisValue)}\right)=${latexNumber(step.contribution)}
        \]
      </div>
    `;
    stepCards.appendChild(card);
  });

  const contributionTerms = data.steps.map(step => latexNumber(step.contribution));
  const expandedTerms = data.steps
    .map(step => `${latexNumber(step.yk)}\\left(${latexNumber(step.basisValue)}\\right)`);
  const expandedLatex = alignedLatexSum(`P(${target})`, expandedTerms, 1);
  const contributionLatex = alignedLatexSum(`P(${target})`, contributionTerms, 2);
  const finalCard = document.createElement('article');
  finalCard.className = 'step-card final-sum-card math-step-card';
  finalCard.innerHTML = String.raw`
    <h4>Final Assembly</h4>
    <div class="step-subsection">
      <strong>1. Substitute every contribution</strong>
      <div class="math-line final-math">
        \[
          ${expandedLatex}
        \]
      </div>
    </div>
    <div class="step-subsection">
      <strong>2. Add the terms</strong>
      <div class="math-line final-math">
        \[
          ${contributionLatex}
        \]
      </div>
    </div>
    <div class="contribution-box math-contribution final-answer-box">
      \[
        \boxed{P(${target})=${latexNumber(data.result)}}
      \]
    </div>
  `;
  stepCards.appendChild(finalCard);

  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetClear && MathJax.typesetClear([stepCards]);
    MathJax.typesetPromise([stepCards]).catch(() => {});
  }
}

function buildSolutionText(data) {
  const pointText = data.points
    .map((point, index) => `(x${index}, y${index}) = (${formatNumber(point.x)}, ${formatNumber(point.y)})`)
    .join('\n');

  const basisText = data.steps.map(step => {
    const factorText = step.targetFactors
      .map(factor => `  (${formatNumber(data.targetX)} - ${formatNumber(factor.xj)}) / (${formatNumber(step.xk)} - ${formatNumber(factor.xj)}) = ${formatNumber(factor.numeratorFactor)} / ${formatNumber(factor.denominatorFactor)}`)
      .join('\n');
    return [
      `L${step.k}(x): ${step.formula}`,
      factorText,
      `Numerator product = ${formatNumber(step.numeratorAtTarget)}`,
      `Denominator product = ${formatNumber(step.denominator)}`,
      `L${step.k}(${formatNumber(data.targetX)}) = ${formatNumber(step.basisValue)}`,
      `y${step.k}L${step.k}(${formatNumber(data.targetX)}) = ${formatNumber(step.yk)}(${formatNumber(step.basisValue)}) = ${formatNumber(step.contribution)}`,
    ].join('\n');
  }).join('\n\n');

  const contributionSum = data.steps
    .map(step => formatNumber(step.contribution))
    .join(' + ');

  return `LAGRANGE INTERPOLATION SOLUTION\n\nGiven:\n${pointText}\n\nEvaluate at x = ${formatNumber(data.targetX)}\n\nFormula:\nP_n(x) = sum y_k L_k(x)\nL_k(x) = product of (x - x_j) / (x_k - x_j), where j is not equal to k\n\nStep-by-step basis computation:\n${basisText}\n\nAssemble the result:\nP(${formatNumber(data.targetX)}) = ${contributionSum}\nP(${formatNumber(data.targetX)}) = ${formatNumber(data.result)}\n\nInterpolating polynomial:\n${data.polynomialText}\n\nMode: ${data.mode}\n${data.warning || ''}`;
}

function renderFullSolution(data) {
  fullSolution.textContent = buildSolutionText(data);
}

function renderPlot(data) {
  const css = getComputedStyle(document.body);
  const textColor = css.getPropertyValue('--text').trim();
  const gridColor = css.getPropertyValue('--grid').trim();

  const curve = {
    x: data.plotPoints.map(point => point.x),
    y: data.plotPoints.map(point => point.y),
    mode: 'lines',
    name: 'Interpolating Polynomial',
    line: { width: 4, shape: 'spline' },
    hovertemplate: 'x=%{x:.4f}<br>P(x)=%{y:.4f}<extra></extra>',
  };
  const dataPoints = {
    x: data.points.map(point => point.x),
    y: data.points.map(point => point.y),
    mode: 'markers+text',
    name: 'Data Points',
    text: data.points.map((_, index) => `P${index}`),
    textposition: 'top center',
    marker: { size: 12, line: { width: 2 } },
    hovertemplate: 'Data point<br>x=%{x}<br>y=%{y}<extra></extra>',
  };
  const targetPoint = {
    x: [data.targetX],
    y: [data.result],
    mode: 'markers+text',
    name: 'Target Value',
    text: [`P(${formatNumber(data.targetX)})`],
    textposition: 'bottom center',
    marker: { size: 17, symbol: 'diamond', line: { width: 2 } },
    hovertemplate: 'Target<br>x=%{x}<br>P(x)=%{y:.6f}<extra></extra>',
  };

  Plotly.newPlot('plot', [curve, dataPoints, targetPoint], {
    margin: { l: 58, r: 24, t: 118, b: 70 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: textColor },
    xaxis: { title: 'x', gridcolor: gridColor, zerolinecolor: gridColor },
    yaxis: { title: 'P(x)', gridcolor: gridColor, zerolinecolor: gridColor },
    legend: { orientation: 'h', x: 0.5, y: 1.24, xanchor: 'center', yanchor: 'bottom', bgcolor: 'rgba(5, 7, 17, 0.72)', bordercolor: gridColor, borderwidth: 1, font: { size: 12 } },
    hovermode: 'closest',
  }, { responsive: true, displaylogo: false });
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const cell = String(value ?? '');
  if (/[",\n]/.test(cell)) {
    return `"${cell.replaceAll('\"', '\"\"')}"`;
  }
  return cell;
}

function downloadCsv() {
  if (!latestData) return showError('Calculate first before exporting.');

  const target = formatNumber(latestData.targetX);
  const result = formatNumber(latestData.result);

  const summaryRows = [
    ['Lagrange Interpolation Calculator Export'],
    ['Target x', target],
    ['Final Answer', `P(${target})`, result],
    ['Mode', latestData.mode],
    ['Interpolating Polynomial', latestData.polynomialText],
    [''],
  ];

  const header = ['k', 'xk', 'yk', 'denominator', 'numerator_at_target', 'basis_value', 'contribution'];
  const rows = latestData.steps.map(step => [
    step.k,
    formatNumber(step.xk),
    formatNumber(step.yk),
    formatNumber(step.denominator),
    formatNumber(step.numeratorAtTarget),
    formatNumber(step.basisValue),
    formatNumber(step.contribution),
  ]);

  const finalRows = [
    [''],
    ['Final Contribution Sum', '', '', '', '', '', result],
    ['Final Answer', `P(${target})`, result],
  ];

  const csv = [...summaryRows, header, ...rows, ...finalRows]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\n');

  downloadFile('lagrange_steps_with_answer.csv', csv, 'text/csv');
}

async function copyText(text, successMessage = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
    showError(successMessage);
    setTimeout(clearError, 1200);
  } catch (_) {
    showError('Copy failed. You may copy manually from the solution box.');
  }
}

function printSolution() {
  if (!latestData) return showError('Calculate first before printing.');
  window.print();
}

function randomDemo() {
  const count = 5;
  const used = new Set();
  const points = [];
  while (points.length < count) {
    const x = points.length === 0 ? -2 : points[points.length - 1][0] + 1 + Math.round(Math.random());
    if (used.has(x)) continue;
    used.add(x);
    const y = Math.round((0.65 * x * x - 1.3 * x + Math.sin(x) * 2 + 4) * 100) / 100;
    points.push([x, y]);
  }
  const middle = points[Math.floor(points.length / 2)][0] + 0.35;
  setRows(points, middle);
}

document.getElementById('addRow').addEventListener('click', () => addRow());
document.getElementById('clearRows').addEventListener('click', () => {
  setRows([], '', false);
  clearError();
  resetOutputState();
});
document.getElementById('calculateBtn').addEventListener('click', calculate);
document.getElementById('downloadCsv').addEventListener('click', downloadCsv);
document.getElementById('downloadTxt').addEventListener('click', () => {
  if (!latestData) return showError('Calculate first before downloading.');
  downloadFile('lagrange_solution.txt', buildSolutionText(latestData), 'text/plain');
});
document.getElementById('copyResult').addEventListener('click', () => {
  if (!latestData) return showError('Calculate first before copying.');
  copyText(`${resultValue.textContent}\n${polynomialText.textContent}`, 'Result copied.');
});
document.getElementById('copyFullSolution').addEventListener('click', () => {
  if (!latestData) return showError('Calculate first before copying.');
  copyText(buildSolutionText(latestData), 'Full solution copied.');
});
document.getElementById('printSolution').addEventListener('click', printSolution);
document.getElementById('randomDemo').addEventListener('click', randomDemo);
targetX.addEventListener('input', queueCalculation);
autoCalculate.addEventListener('change', () => {
  if (autoCalculate.checked) queueCalculation(0);
});
document.querySelectorAll('.loadPreset').forEach(button => {
  button.addEventListener('click', () => {
    const preset = presets[button.dataset.preset];
    setRows(preset.points, preset.target);
    document.getElementById('calculator').scrollIntoView({ behavior: 'smooth' });
  });
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

// Start with empty values and no computation.
// Auto-calculate remains enabled, but it will only run after complete valid inputs are entered.
setRows([], '', false);
addRow('', '', false);
addRow('', '', false);
resetOutputState();

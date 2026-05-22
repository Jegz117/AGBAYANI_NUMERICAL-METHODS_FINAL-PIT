# Lagrange Interpolation Flask Project

A Vercel-ready Numerical Methods online calculator focused on **Lagrange Interpolation**.

## Features

- Mathematical discussion with MathJax-rendered formulas
- Two static, fully worked examples with intermediate steps
- Interactive Lagrange Interpolation calculator
- Add/remove point rows dynamically
- Sample data presets and random demo generator
- Auto-calculate toggle
- Interpolation/extrapolation badge and warning
- Step-by-step basis polynomial computation
- Full generated solution text
- Interactive Plotly graph with data points, curve, and target point
- Copy result and copy full solution
- Export solution steps as CSV
- Download full solution as TXT
- Print-friendly solution section
- Light/dark theme toggle
- Safe parsing: no `eval()`, no `exec()`, no formula execution
- Modular code: algorithm logic is separated in `utils/lagrange.py`

## Technologies

- Python 3.8+
- Flask
- HTML/CSS
- JavaScript
- MathJax
- Plotly.js
- Gunicorn for deployment

## Run Locally

```bash
python -m venv venv
```

Windows PowerShell:

```bash
.\venv\Scripts\Activate.ps1
```

Mac/Linux:

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the app:

```bash
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

## Project Structure

```text
lagrange_interpolation_project/
├── app.py
├── requirements.txt
├── vercel.json
├── README.md
├── utils/
│   ├── __init__.py
│   └── lagrange.py
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```

## Deployment Notes for Vercel

This project includes `vercel.json`. Upload/import the project folder to Vercel and use the default Python/Flask deployment setup.

## Input Safety

The server accepts JSON only. Values are parsed through `float()` and validated. The app rejects blank values, non-numeric values, NaN, Infinity, repeated x-values, fewer than two points, and more than twelve points. The algorithm is implemented manually without NumPy/SciPy and without evaluating user input as code.

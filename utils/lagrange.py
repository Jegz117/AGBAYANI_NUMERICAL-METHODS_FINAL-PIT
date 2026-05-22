"""Manual Lagrange interpolation utilities.

The functions in this module intentionally avoid eval(), exec(), NumPy, and SciPy.
User input is parsed only through float conversion and validated before use.
"""

from __future__ import annotations

from math import isfinite
from typing import Any, Dict, List, Tuple

Number = float
Point = Tuple[Number, Number]
MAX_POINTS = 12


def format_number(value: float) -> str:
    """Format a number compactly for display."""
    if abs(value) < 1e-12:
        return "0"
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.8g}"


def validate_points(raw_points: Any, raw_x: Any) -> Tuple[List[Point], float]:
    """Validate JSON input and return numeric points plus evaluation x.

    Safety rules:
    - Accept only a list of objects with x and y values.
    - Parse values using float() only.
    - Reject NaN, Infinity, blank entries, duplicate x-values, and too many points.
    - Do not evaluate user-supplied formulas or Python code.
    """
    if not isinstance(raw_points, list):
        raise ValueError("Points must be sent as a list of {x, y} objects.")

    points: List[Point] = []
    for index, item in enumerate(raw_points, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Point {index} must contain x and y fields.")

        raw_x_value = item.get("x")
        raw_y_value = item.get("y")
        if raw_x_value in (None, "") or raw_y_value in (None, ""):
            raise ValueError(f"Point {index} has an empty x or y value.")

        try:
            x_val = float(raw_x_value)
            y_val = float(raw_y_value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Point {index} must contain valid numeric x and y values.") from exc

        if not isfinite(x_val) or not isfinite(y_val):
            raise ValueError("Infinite or NaN values are not allowed.")
        points.append((x_val, y_val))

    if len(points) < 2:
        raise ValueError("Enter at least two data points.")
    if len(points) > MAX_POINTS:
        raise ValueError(f"For clarity and stability, this calculator accepts up to {MAX_POINTS} points.")

    seen = set()
    for x_val, _ in points:
        if x_val in seen:
            raise ValueError("Duplicate x-values are not allowed in Lagrange interpolation.")
        seen.add(x_val)

    if raw_x in (None, ""):
        raise ValueError("The interpolation value x cannot be empty.")
    try:
        target_x = float(raw_x)
    except (TypeError, ValueError) as exc:
        raise ValueError("The interpolation value x must be a valid number.") from exc
    if not isfinite(target_x):
        raise ValueError("The interpolation value cannot be infinite or NaN.")

    return points, target_x


def poly_multiply(poly_a: List[float], poly_b: List[float]) -> List[float]:
    """Multiply two polynomials stored in ascending powers of x."""
    product = [0.0] * (len(poly_a) + len(poly_b) - 1)
    for i, coeff_a in enumerate(poly_a):
        for j, coeff_b in enumerate(poly_b):
            product[i + j] += coeff_a * coeff_b
    return product


def poly_add(poly_a: List[float], poly_b: List[float]) -> List[float]:
    """Add two polynomials stored in ascending powers of x."""
    length = max(len(poly_a), len(poly_b))
    result = [0.0] * length
    for i in range(length):
        result[i] = (poly_a[i] if i < len(poly_a) else 0.0) + (
            poly_b[i] if i < len(poly_b) else 0.0
        )
    return result


def evaluate_polynomial(coefficients: List[float], x_value: float) -> float:
    """Evaluate a polynomial by Horner's method."""
    total = 0.0
    for coefficient in reversed(coefficients):
        total = total * x_value + coefficient
    return total


def polynomial_to_text(coefficients: List[float]) -> str:
    """Return a readable polynomial expression in descending powers."""
    terms: List[str] = []
    for power in range(len(coefficients) - 1, -1, -1):
        coeff = coefficients[power]
        if abs(coeff) < 1e-10:
            continue
        sign = "-" if coeff < 0 else "+"
        abs_coeff = abs(coeff)
        if power == 0:
            body = format_number(abs_coeff)
        elif power == 1:
            body = "x" if abs(abs_coeff - 1) < 1e-10 else f"{format_number(abs_coeff)}x"
        else:
            body = f"x^{power}" if abs(abs_coeff - 1) < 1e-10 else f"{format_number(abs_coeff)}x^{power}"
        terms.append(f"{sign} {body}")

    if not terms:
        return "P(x) = 0"
    first = terms[0]
    if first.startswith("+ "):
        first = first[2:]
    return "P(x) = " + " ".join([first, *terms[1:]])


def basis_formula_text(k: int, points: List[Point]) -> str:
    """Create a readable L_k(x) formula."""
    x_k = points[k][0]
    pieces = []
    for j, (x_j, _) in enumerate(points):
        if j != k:
            pieces.append(f"(x - {format_number(x_j)})/({format_number(x_k)} - {format_number(x_j)})")
    return f"L{k}(x) = " + " · ".join(pieces)


def generate_plot_points(points: List[Point], coefficients: List[float], target_x: float) -> List[Dict[str, float]]:
    """Generate smooth plot samples for the interpolating polynomial."""
    x_values = [point[0] for point in points] + [target_x]
    min_x, max_x = min(x_values), max(x_values)
    width = max(max_x - min_x, 1.0)
    start = min_x - 0.18 * width
    end = max_x + 0.18 * width
    samples = 180
    return [
        {
            "x": start + (end - start) * i / (samples - 1),
            "y": evaluate_polynomial(coefficients, start + (end - start) * i / (samples - 1)),
        }
        for i in range(samples)
    ]


def build_lagrange(points: List[Point], target_x: float) -> Dict[str, Any]:
    """Calculate Lagrange basis values, contributions, and full polynomial."""
    n = len(points)
    polynomial = [0.0]
    steps: List[Dict[str, Any]] = []
    basis_values: List[float] = []

    for k in range(n):
        x_k, y_k = points[k]
        denominator = 1.0
        numerator_at_target = 1.0
        basis_poly = [1.0]
        target_factors: List[Dict[str, float]] = []

        for j in range(n):
            if j == k:
                continue
            x_j, _ = points[j]
            denominator_factor = x_k - x_j
            numerator_factor = target_x - x_j
            denominator *= denominator_factor
            numerator_at_target *= numerator_factor
            basis_poly = poly_multiply(basis_poly, [-x_j, 1.0])
            target_factors.append(
                {
                    "j": j,
                    "xj": x_j,
                    "numeratorFactor": numerator_factor,
                    "denominatorFactor": denominator_factor,
                }
            )

        if abs(denominator) < 1e-15:
            raise ValueError("Invalid data: denominator became zero due to repeated x-values.")

        basis_value = numerator_at_target / denominator
        contribution = y_k * basis_value
        scaled_basis_poly = [(y_k / denominator) * coeff for coeff in basis_poly]
        polynomial = poly_add(polynomial, scaled_basis_poly)
        basis_values.append(basis_value)

        steps.append(
            {
                "k": k,
                "xk": x_k,
                "yk": y_k,
                "formula": basis_formula_text(k, points),
                "denominator": denominator,
                "numeratorAtTarget": numerator_at_target,
                "basisValue": basis_value,
                "contribution": contribution,
                "targetFactors": target_factors,
            }
        )

    interpolated_y = sum(step["contribution"] for step in steps)
    polynomial_y = evaluate_polynomial(polynomial, target_x)
    min_x, max_x = min(point[0] for point in points), max(point[0] for point in points)
    mode = "Interpolation" if min_x <= target_x <= max_x else "Extrapolation"
    warning = "" if mode == "Interpolation" else "Target x is outside the data range. Extrapolation is usually less reliable."

    return {
        "points": [{"x": x, "y": y} for x, y in points],
        "targetX": target_x,
        "result": interpolated_y,
        "polynomialCheck": polynomial_y,
        "basisValues": basis_values,
        "steps": steps,
        "polynomialCoefficients": polynomial,
        "polynomialText": polynomial_to_text(polynomial),
        "mode": mode,
        "warning": warning,
        "degree": n - 1,
        "maxPoints": MAX_POINTS,
        "plotPoints": generate_plot_points(points, polynomial, target_x),
    }

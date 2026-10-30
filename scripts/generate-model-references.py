"""Independent Python references for the published PBRC 2018 and Antonetti 2022 equations.

Run with `uv run --no-project scripts/generate-model-references.py`.
PBRC uses the author's 0.001-day RK4 step; the application uses an independently written TS solver.
Antonetti uses RK4 rather than the application's analytic daily transition.
These are equation-reproduction fixtures, not observed weight-loss outcomes.
"""
import json
import math
from pathlib import Path
from typing import Callable


def rk4(value: float, rhs: Callable[[float], float], step: float) -> float:
    """Advance one independently implemented fourth-order integration step."""
    k1 = rhs(value)
    k2 = rhs(value + step * k1 / 2)
    k3 = rhs(value + step * k2 / 2)
    k4 = rhs(value + step * k3)
    return value + step * (k1 + 2 * k2 + 2 * k3 + k4) / 6


def reference(case: dict, model: str) -> list[dict]:
    """Integrate dated forcing from one fixed physiology baseline."""
    w0, tdee, fat_pct = case['weightKg'], case['tdeeKcal'], case['bodyFatPct']
    male = case['sex'] == 'male'
    a, p, y = (293, .433, 5.92) if male else (248, .4356, 5.09)
    rmr0 = a * w0 ** p - y * case['ageYears']
    activity0 = max(0, tdee * (1 - .075 - .326) - rmr0)
    neat_constant = .326 * tdee - 2 * (rmr0 + activity0 + .075 * tdee)
    fat0 = w0 * fat_pct / 100
    forbes_log_c = math.log(fat0) - (w0 - fat0) / 10.4
    gamma = -6.25 * case['heightCm'] + 5 * case['ageYears'] - 166 * int(male) + 161
    antonetti_m0 = (.9 * tdee - 10 * w0 + gamma) / w0
    state = fat0 if model == 'thomas' else w0
    samples = []
    for day in range(85):
        ffm = 10.4 * (math.log(state) - forbes_log_c) if model == 'thomas' else None
        weight = state + ffm if ffm is not None else state
        if day in [0, 7, 14, 28, 56, 84]:
            samples.append({'day': day, 'weightKg': weight, 'fatMassKg': state if ffm is not None else None,
                            'fatFreeMassKg': ffm, 'bodyFatPct': 100 * state / weight if ffm is not None else None})
        if day == 84:
            break
        intake = case['intakes'][day]
        delta = case['activityDeltas'][day]
        if model == 'thomas':
            def rhs(fat: float) -> float:
                """Author-reference energy balance with fixed-age RMR and endogenous NEAT."""
                body_weight = fat + 10.4 * (math.log(fat) - forbes_log_c)
                rmr = a * body_weight ** p - y * case['ageYears']
                pa = (activity0 / w0 + delta) * body_weight
                dit = .075 * intake
                neat = max(0, 2 * (rmr + pa + dit) + neat_constant)
                return (intake - (.98 * rmr + pa + dit + neat)) / (9500 + 10.4 * 1020 / fat)
        else:
            def rhs(weight: float) -> float:
                """Modified Antonetti ODE from the 2022 paper, without using its analytic solution."""
                return (.9 * intake + gamma - (antonetti_m0 + delta + 10) * weight) / 7700
        for _ in range(1000):
            state = rk4(state, rhs, .001)
    return samples


def main() -> None:
    """Freeze transparent inputs and independently integrated sample outputs."""
    cases = []
    for name, sex, age, height, weight, fat, pal, change, moving in [
        ('male-reference-maintenance', 'male', 36, 170, 76, 24.7, 1.6, 0, False),
        ('male-deficit', 'male', 36, 170, 76, 24.7, 1.6, -500, False),
        ('female-deficit', 'female', 34, 165, 72, 32, 1.6, -400, False),
        ('female-measured-composition', 'female', 45, 170, 85, 40, 1.8, -400, False),
        ('piecewise-diet-and-activity', 'male', 30, 180, 90, 28, 2.1, -450, True),
    ]:
        tdee = (9.99 * weight + 6.25 * height - 4.92 * age + (5 if sex == 'male' else -161)) * pal
        case = dict(id=name, sex=sex, ageYears=age, heightCm=height, weightKg=weight, bodyFatPct=fat,
                    pal=pal, tdeeKcal=tdee,
                    intakes=[tdee + change + (200 if moving and day >= 28 else 0) for day in range(84)],
                    activityDeltas=[.6 if moving and 14 <= day < 42 else 0 for day in range(84)])
        case['thomas'] = reference(case, 'thomas')
        case['antonetti'] = reference(case, 'antonetti')
        cases.append(case)
    output = {'sources': {'thomas': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9114632/',
                          'antonetti': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9691568/'},
              'solver': 'Independent Python RK4, 0.001 day, fixed baseline and continuous state', 'cases': cases}
    Path('tests/fixtures/model-references.json').write_text(json.dumps(output, indent=2) + '\n')


if __name__ == '__main__':
    main()

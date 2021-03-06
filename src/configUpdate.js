import raf, { cancel as caf } from 'raf';
import {
  getIntersectionKeys,
  mapObject,
  translateStyle,
} from './util';
import { filter } from 'lodash';

const alpha = (begin, end, k) => {
  return begin + (end - begin) * k;
};

const needContinue = ({ from, to }) => {
  return from !== to;
};

/*
 * @description: cal new from value and velocity in each stepper
 * @return: { [styleProperty]: { from, to, velocity } }
 */
const calStepperVals = (easing, preVals, steps) => {
  const nextStepVals = mapObject((key, val) => {
    if (needContinue(val)) {
      const [newX, newV] = easing(val.from, val.to, val.velocity);
      return {
        ...val,
        from: newX,
        velocity: newV,
      };
    }

    return val;
  }, preVals);

  if (steps < 1) {
    return mapObject((key, val) => {
      if (needContinue(val)) {
        return {
          ...val,
          velocity: alpha(val.velocity, nextStepVals[key].velocity, steps),
          from: alpha(val.from, nextStepVals[key].from, steps),
        };
      }

      return val;
    }, preVals);
  }

  return calStepperVals(easing, nextStepVals, steps - 1);
};

// configure update function
export default (from, to, easing, duration, render) => {
  const interKeys = getIntersectionKeys(from, to);
  const timingStyle = interKeys.reduce((res, key) => {
    return {
      ...res,
      [key]: [from[key], to[key]],
    };
  }, {});
  let stepperStyle = interKeys.reduce((res, key) => {
    return {
      ...res,
      [key]: {
        from: from[key],
        velocity: 0,
        to: to[key],
      },
    };
  }, {});
  let cafId = -1;
  let update = () => {};
  let preTime;
  let beginTime;

  // stepper timing function like spring
  if (easing.isStepper) {
    const getCurrStyle = () => {
      return mapObject((key, val) => val.from, stepperStyle);
    };
    const shouldStopAnimation = () => {
      return !filter(stepperStyle, needContinue).length;
    };

    update = (now) => {
      if (!preTime) {
        preTime = now;
      }
      const deltaTime = now - preTime;
      const steps = deltaTime / easing.dt;

      stepperStyle = calStepperVals(easing, stepperStyle, steps);
      // get union set and add compatible prefix
      render(translateStyle({
        ...from,
        ...to,
        ...getCurrStyle(stepperStyle),
      }));

      preTime = now;

      if (!shouldStopAnimation()) {
        cafId = raf(update);
      }
    };
  } else {
    // t => val timing function like cubic-bezier
    update = (now) => {
      if (!beginTime) {
        beginTime = now;
      }

      const t = (now - beginTime) / duration;
      const currStyle = mapObject((key, val) =>
        alpha(...val, easing(t)), timingStyle);
      // get union set and add compatible prefix
      render(translateStyle({
        ...from,
        ...to,
        ...currStyle,
      }));

      if (t < 1) {
        cafId = raf(update);
      }
    };
  }

  // return start animation method
  return () => {
    raf(update);

    // return stop animation method
    return () => {
      caf(cafId);
    };
  };
};

import { reaction, observable, isObservable, IReactionDisposer, ObservableMap, IObservableValue } from 'mobx';

import StorageAdapter from './StorageAdapter';

interface Options<T> {
  properties: (keyof T)[];
  adapter: StorageAdapter;
  delay?: number;
}

type Synchronize<T> = T & {
  isSynchronized: IObservableValue<boolean>;
};

function dispose(disposers: IReactionDisposer[]) {
  disposers.forEach((disposer) => disposer());
}

function getKeys<T>(object: T) {
  return Object.keys(object) as (keyof T)[];
}

export default function persistConfigure<T>(target: Synchronize<T>, options: Options<T>) {
  if (!options.delay) options.delay = 5000;

  target.isSynchronized = observable.box(false);

  const disposers: IReactionDisposer[] = [];
  const reactionOptions = { delay: options.delay };

  options.properties.forEach((property) => {
    if (!isObservable(target[property])) {
      console.warn('The property `' + property + '` is not observable and not affected reaction.');
      return;
    }

    const disposer = reaction(
      () => target[property],
      () => options.adapter.writeInStorage(target.constructor.name, target),
      reactionOptions,
    );

    disposers.push(disposer);
  });

  options.adapter.readFromStorage<T>(target.constructor.name).then((content) => {
    if (content) {
      getKeys(content).forEach((property) => {
        if (target[property] instanceof ObservableMap) {
          const targetPartial = target[property];
          const observableMap = new Map(
            getKeys(content[property]).reduce<[keyof typeof targetPartial, Record<string, any>][]>((p, k) => {
              return p.concat([k, content[property][k]]);
            }, []),
          );
          target[property] = (observableMap as unknown) as typeof targetPartial;
        } else {
          (target as T)[property] = content[property];
        }
      });
    }

    target.isSynchronized.set(true);
  });

  return {
    disposer: () => dispose(disposers),
    clear: () => options.adapter.writeInStorage(name, {}),
  };
}

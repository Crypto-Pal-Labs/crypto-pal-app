// src/navigation/RootNavigation.ts
import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const rootNavRef = createNavigationContainerRef();

/**
 * Reset the entire navigation state to the given routes.
 * @param routes e.g. [{ name: 'Welcome' }]
 */
export function resetRoot(routes: { name: string; params?: object }[]) {
  if (rootNavRef.isReady()) {
    rootNavRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes,
      })
    );
  }
}

import type { Href, useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// A screen opened straight from a link or a browser reload has no history, so
// router.back() would do nothing. Go to the screen's parent instead.
export function goBack(router: Router, parent: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(parent);
}

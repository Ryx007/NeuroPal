// Web stand-in for react-native-pager-view (native-only). Implements the
// slice of the PagerView API the app uses: children as pages, initialPage,
// onPageSelected, and the setPage() imperative handle.
import { Children, forwardRef, useImperativeHandle, useRef } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

const PagerView = forwardRef(function PagerView(
  { children, style, initialPage = 0, onPageSelected },
  ref
) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      setPage(index) {
        scrollRef.current?.scrollTo({ x: index * width, animated: true });
        onPageSelected?.({ nativeEvent: { position: index } });
      },
    }),
    [width, onPageSelected]
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={style}
      contentOffset={{ x: initialPage * width, y: 0 }}
      onMomentumScrollEnd={(event) =>
        onPageSelected?.({
          nativeEvent: {
            position: Math.round(event.nativeEvent.contentOffset.x / width),
          },
        })
      }
    >
      {Children.map(children, (child) => (
        <View style={{ width, flex: 1 }}>{child}</View>
      ))}
    </ScrollView>
  );
});

export default PagerView;

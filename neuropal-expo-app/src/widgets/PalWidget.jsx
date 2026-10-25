"use no memo";
// ↑ The widget library calls these components as plain functions to build a
// native view tree (no React renderer): the React Compiler (app.json →
// experiments.reactCompiler) must not insert its memo-cache hooks here.
// For the same reason: no hooks and no fragments in this file.

import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";

import { TEXT_SP } from "./model";

// The "Pal" home-screen widget, drawn from a view model (model.js →
// buildViewModel). Colours come from the user's skin snapshot; every state
// is a word plus a shape glyph; every tap target has its own TalkBack label.

function Text({ text, size, font, color, maxLines = 1, style }) {
  return (
    <TextWidget
      text={text}
      maxLines={maxLines}
      truncate="END"
      style={{ fontSize: size, fontFamily: font.family, fontWeight: font.weight, color, ...style }}
    />
  );
}

// `glyph` false: the narrowest header has room for the word only (it still
// names the state, so it is never colour alone).
function StateLine({ model, size, glyph = true }) {
  const { colors, fonts, state } = model;
  if (!state) {
    return <Text text={model.stateText} size={size} font={fonts.body} color={colors.muted} />;
  }
  return (
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", height: "wrap_content", width: "wrap_content" }}>
      {glyph ? <SvgWidget svg={state.glyph} style={{ width: 12, height: 12 }} /> : null}
      <Text text={state.word} size={size} font={fonts.body} color={colors.text} style={glyph ? { marginLeft: 6 } : undefined} />
    </FlexWidget>
  );
}

function AnchorLine({ model, label }) {
  const { colors, fonts, skin } = model;
  const signal = skin === "signal";
  return (
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", height: "wrap_content", width: "match_parent" }}>
      {label ? (
        <Text
          text={signal ? "NEXT" : "Next"}
          size={TEXT_SP.anchor}
          font={fonts.label}
          color={colors.muted}
          style={{ marginRight: 8, letterSpacing: signal ? 1 : 0 }}
        />
      ) : null}
      <Text text={model.anchor.text} size={TEXT_SP.anchor} font={fonts.body} color={label ? colors.text : colors.muted} />
    </FlexWidget>
  );
}

function HeaderText({ model }) {
  const { layout, colors, fonts } = model;
  const items = layout.header.map((item, i) => {
    const gap = i > 0 ? { marginTop: 2 } : {};
    if (item === "name") {
      return <Text key="name" text={model.name} size={layout.nameSp} font={fonts.display} color={colors.text} style={gap} />;
    }
    if (item === "anchor") {
      return <Text key="anchor" text={model.anchor.text} size={TEXT_SP.anchor} font={fonts.body} color={colors.muted} style={gap} />;
    }
    return (
      <FlexWidget key="state" style={{ height: "wrap_content", width: "wrap_content", ...gap }}>
        <StateLine model={model} size={layout.stateSp} glyph={layout.stateGlyph} />
      </FlexWidget>
    );
  });
  return (
    <FlexWidget style={{ flex: 1, width: 0, height: "wrap_content", flexDirection: "column", marginLeft: layout.narrow ? 8 : 10 }}>
      {items}
    </FlexWidget>
  );
}

function AskPill({ model }) {
  const { layout, colors, fonts, ask, skin } = model;
  const signal = skin === "signal";
  const icon = layout.ask === "icon";
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: ask.url }}
      accessibilityLabel={ask.a11y}
      style={{
        height: layout.askH,
        width: icon ? layout.askW : "wrap_content",
        marginLeft: 10,
        paddingHorizontal: icon ? 0 : 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.buttonBg,
        borderRadius: signal ? 8 : Math.round(layout.askH / 2),
        ...(signal ? { borderWidth: 2, borderBottomWidth: 4, borderRightWidth: 4, borderColor: colors.hardInk } : {}),
      }}
    >
      <SvgWidget svg={ask.glyph} style={{ width: 18, height: 18 }} />
      {ask.label ? (
        <Text text={ask.label} size={TEXT_SP.ask} font={fonts.body} color={colors.askText} style={{ marginLeft: 6 }} />
      ) : null}
    </FlexWidget>
  );
}

function Header({ model }) {
  const { layout, pal, ask } = model;
  const face = <SvgWidget svg={pal.svg} style={{ width: pal.width, height: pal.height }} />;
  const frame = { width: "match_parent", height: layout.headerH, marginHorizontal: layout.pad, flexDirection: "row", alignItems: "center" };
  if (layout.narrow) {
    // Narrow (2×2): the whole header is the "Ask Pal" button; its tap area
    // takes in the top and side padding (the widget's top edge).
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: ask.url }}
        accessibilityLabel={ask.a11y}
        style={{
          width: "match_parent",
          height: layout.headerH + layout.pad,
          paddingTop: layout.pad,
          paddingHorizontal: layout.pad,
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 12,
        }}
      >
        {face}
        <HeaderText model={model} />
        {layout.askGlyphInHeader ? <SvgWidget svg={ask.glyph} style={{ width: 16, height: 16, marginLeft: 4 }} /> : null}
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={frame}>
      {face}
      <HeaderText model={model} />
      <AskPill model={model} />
    </FlexWidget>
  );
}

function Row({ model, row }) {
  const { layout, colors, fonts } = model;
  const frame = { width: "match_parent", height: "wrap_content", marginTop: layout.gap, marginHorizontal: layout.pad };
  if (row === "state") {
    return (
      <FlexWidget style={frame}>
        <StateLine model={model} size={TEXT_SP.state} />
      </FlexWidget>
    );
  }
  if (row === "anchor") {
    return (
      <FlexWidget style={frame}>
        <AnchorLine model={model} label={!layout.narrow} />
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={frame}>
      <Text text={model.line} size={TEXT_SP.line} font={fonts.body} color={colors.muted} maxLines={2} />
    </FlexWidget>
  );
}

// The tap area is a full third of the widget (into the side and bottom
// padding); the visible button sits inset inside it.
function CheckinButton({ model, button, index }) {
  const { layout, colors, fonts, skin } = model;
  const signal = skin === "signal";
  const kind = layout.buttonKind;
  const on = button.selected;
  const half = layout.btnGap / 2;
  const inset = {
    paddingLeft: index === 0 ? layout.edge : half,
    paddingRight: index === 2 ? layout.edge : half,
    paddingBottom: layout.pad,
  };
  const radius = signal ? 8 : layout.narrow ? 14 : Math.round(layout.buttonH / 2);
  const outline = signal
    ? on
      ? { borderWidth: 2, borderBottomWidth: 4, borderRightWidth: 4, borderColor: colors.hardInk }
      : { borderWidth: 2, borderColor: colors.border }
    : {};
  return (
    <FlexWidget
      clickAction={button.clickAction}
      clickActionData={button.clickActionData}
      accessibilityLabel={button.a11y}
      style={{ width: layout.targets[index], height: "match_parent", ...inset }}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          flexDirection: kind === "column" ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: on ? colors.fill : colors.buttonBg,
          borderRadius: radius,
          ...outline,
        }}
      >
        <SvgWidget svg={button.glyph} style={{ width: layout.glyph, height: layout.glyph }} />
        {kind === "glyph" ? null : (
          <Text
            text={button.word}
            size={TEXT_SP.button}
            font={fonts.body}
            color={on ? colors.fillInk : colors.btnText}
            style={kind === "column" ? { marginTop: 3 } : { marginLeft: 6 }}
          />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

export function PalWidget({ model }) {
  const { layout, colors, skin } = model;
  const signal = skin === "signal";
  return (
    <FlexWidget
      accessibilityLabel={model.a11y}
      style={{
        width: "match_parent",
        height: "match_parent",
        flexDirection: "column",
        justifyContent: "center",
        // Narrow: the header's tap area carries the top padding itself.
        paddingTop: layout.narrow ? 0 : layout.pad,
        backgroundColor: colors.bg,
        borderRadius: signal ? 12 : 22,
        ...(signal ? { borderWidth: 2, borderColor: colors.border } : {}),
      }}
    >
      <Header model={model} />
      {layout.rows.map((row) => (
        <Row key={row} model={model} row={row} />
      ))}
      <FlexWidget
        style={{ width: "match_parent", height: layout.buttonH + layout.pad, flexDirection: "row", marginTop: layout.gap }}
      >
        {model.buttons.map((button, index) => (
          <CheckinButton key={button.id} model={model} button={button} index={index} />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

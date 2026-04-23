import {
  Box,
  Button,
  Chip,
  Drawer,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import { useDispatch, useSelector } from "react-redux";

import { selectUiState } from "../store/selectors";
import {
  setAccent,
  setDensity,
  setFontSize,
  setLineSpacing,
  setReaderFont,
  setReaderLayout,
  setTheme,
  setVoice,
  setWpm,
} from "../store/slices/uiSlice";
import { usePalette } from "../theme/ThemeProvider";

export function TweaksSheet({ visible, onClose }) {
  const palette = usePalette();
  const tweaks = useSelector(selectUiState);
  const dispatch = useDispatch();

  return (
    <Drawer
      anchor="right"
      open={visible}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 360,
          px: 3,
          py: 3,
          backgroundColor: palette.surfaceContainer,
          color: palette.onSurface,
          borderLeft: `1px solid ${palette.outlineVariant}`,
        },
      }}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: palette.onSurfaceVariant }}>
            Tweaks
          </Typography>
          <Typography variant="h5">Reader controls</Typography>
        </Box>

        <ChipGroup
          label="Theme"
          value={tweaks.theme}
          entries={[
            ["dark", "Dark"],
            ["sepia", "Sepia"],
            ["light", "Light"],
            ["contrast", "Contrast"],
          ]}
          onChange={(value) => dispatch(setTheme(value))}
        />

        <ChipGroup
          label="Accent"
          value={tweaks.accent}
          entries={[
            ["blue", "Blue"],
            ["cyan", "Cyan"],
            ["purple", "Purple"],
            ["green", "Green"],
          ]}
          onChange={(value) => dispatch(setAccent(value))}
        />

        <ChipGroup
          label="Reader font"
          value={tweaks.readerFont}
          entries={[
            ["inter", "Inter"],
            ["atkinson", "Atkinson"],
            ["dyslexic", "Dyslexic"],
            ["lora", "Lora"],
            ["fraunces", "Fraunces"],
          ]}
          onChange={(value) => dispatch(setReaderFont(value))}
        />

        <ChipGroup
          label="Layout"
          value={tweaks.readerLayout}
          entries={[
            ["split", "Split"],
            ["focus", "Focus"],
            ["paginated", "Paginated"],
          ]}
          onChange={(value) => dispatch(setReaderLayout(value))}
        />

        <ChipGroup
          label="Density"
          value={tweaks.density}
          entries={[
            ["calm", "Calm"],
            ["dense", "Dense"],
          ]}
          onChange={(value) => dispatch(setDensity(value))}
        />

        <SliderField
          label={`Font size • ${Math.round(tweaks.fontSize)} pt`}
          value={tweaks.fontSize}
          min={14}
          max={28}
          step={1}
          onChange={(value) => dispatch(setFontSize(value))}
        />

        <SliderField
          label={`Line spacing • ${tweaks.lineSpacing.toFixed(2)}`}
          value={tweaks.lineSpacing}
          min={1.3}
          max={2.2}
          step={0.1}
          onChange={(value) => dispatch(setLineSpacing(value))}
        />

        <SliderField
          label={`Words per minute • ${Math.round(tweaks.wpm)}`}
          value={tweaks.wpm}
          min={120}
          max={400}
          step={10}
          onChange={(value) => dispatch(setWpm(Math.round(value)))}
        />

        <ChipGroup
          label="Voice"
          value={tweaks.voice}
          entries={[
            ["soft", "Soft"],
            ["natural", "Natural"],
            ["deep", "Deep"],
          ]}
          onChange={(value) => dispatch(setVoice(value))}
        />

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </Box>
      </Stack>
    </Drawer>
  );
}

function ChipGroup({ label, value, entries, onChange }) {
  const palette = usePalette();

  return (
    <Stack spacing={1}>
      <Typography variant="overline" sx={{ color: palette.onSurfaceVariant }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {entries.map(([key, display]) => {
          const selected = key === value;
          return (
            <Chip
              key={key}
              label={display}
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              onClick={() => onChange(key)}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}

function SliderField({ label, value, min, max, step, onChange }) {
  const palette = usePalette();

  return (
    <Stack spacing={1}>
      <Typography variant="overline" sx={{ color: palette.onSurfaceVariant }}>
        {label}
      </Typography>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, nextValue) =>
          onChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)
        }
      />
    </Stack>
  );
}

// ─── Dialog context: MUI dialog managed via React Context ────────────
import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: '',
    content: null,
    actions: null,
    maxWidth: 'sm',
  });

  const showDialog = useCallback(({ title, content, actions, maxWidth = 'sm' }) => {
    setState({ open: true, title, content, actions, maxWidth });
  }, []);

  const closeDialog = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const confirm = useCallback(({ title, message, onConfirm, confirmLabel = 'Confirm' }) => {
    showDialog({
      title,
      content: <DialogContentText sx={{ color: 'text.secondary' }}>{message}</DialogContentText>,
      actions: (
        <>
          <Button variant="outlined" onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={() => { onConfirm(); closeDialog(); }}>
            {confirmLabel}
          </Button>
        </>
      ),
    });
  }, [showDialog, closeDialog]);

  return (
    <DialogContext.Provider value={{ showDialog, closeDialog, confirm }}>
      {children}
      <Dialog
        open={state.open}
        onClose={closeDialog}
        maxWidth={state.maxWidth}
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        {state.title && (
          <DialogTitle
            sx={{
              fontFamily: "'Space Grotesk'",
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {state.title}
            <IconButton size="small" onClick={closeDialog}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
        )}
        {state.content && <DialogContent>{state.content}</DialogContent>}
        {state.actions && (
          <DialogActions sx={{ px: 3, pb: 2 }}>{state.actions}</DialogActions>
        )}
      </Dialog>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}

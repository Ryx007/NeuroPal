// The Ask sheet: questions about the open document, answered from the
// document itself (the backend's RAG pipeline), with the passages used as
// citations. Errors are shown right under the question, with Retry.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:provider/provider.dart';

import '../data/models.dart';
import '../reader/math_text.dart';
import '../reader/reader_controller.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_sheet.dart';
import '../widgets/np_text.dart';
import 'ask_controller.dart';

Future<void> showAskSheet(BuildContext context) => showNpSheet<void>(
  context,
  title: 'Ask',
  heightFactor: 0.88,
  builder: (_) => const _AskPanel(),
);

class _AskPanel extends StatefulWidget {
  const _AskPanel();

  @override
  State<_AskPanel> createState() => _AskPanelState();
}

class _AskPanelState extends State<_AskPanel> {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final reader = context.read<ReaderController>();
    final doc = reader.document;
    final source = reader.source;
    final question = _input.text.trim();
    if (doc == null || source == null || question.isEmpty) return;
    _input.clear();
    final ask = context.read<AskController>();
    final future = ask.ask(source, doc.id, question);
    _scrollToEnd();
    await future;
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final reader = context.watch<ReaderController>();
    final ask = context.watch<AskController>();
    final doc = reader.document;
    if (doc == null) {
      return Padding(
        padding: const EdgeInsets.all(18),
        child: Text(
          'Open a document first.',
          style: s.fonts.body(15, s.textMuted),
        ),
      );
    }
    final thread = ask.thread(doc.id);
    final busy = ask.isBusy(doc.id);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 8),
          child: Text(
            'Answers come from “${doc.title}” first, with the passages they '
            'used.',
            style: s.fonts.body(13.5, s.textMuted),
          ),
        ),
        Expanded(
          child: thread.isEmpty
              ? ListView(
                  padding: const EdgeInsets.all(18),
                  children: [
                    const NpLabel('Try'),
                    const SizedBox(height: 8),
                    for (final example in const [
                      'What is the main result?',
                      'Explain the key equation in plain words.',
                      'What assumptions does this rely on?',
                    ])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: NpChip(
                          label: example,
                          selected: false,
                          onTap: () {
                            _input.text = example;
                            unawaited(_send());
                          },
                        ),
                      ),
                  ],
                )
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  itemCount: thread.length,
                  itemBuilder: (context, i) => _ExchangeView(
                    exchange: thread[i],
                    onRetry: () {
                      final source = reader.source;
                      if (source == null) return;
                      unawaited(ask.retry(source, doc.id, thread[i]));
                    },
                  ),
                ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  style: s.fonts.body(15.5, s.text),
                  decoration: const InputDecoration(
                    hintText: 'Ask about this document…',
                    labelText: 'Your question',
                  ),
                ),
              ),
              const SizedBox(width: 10),
              NpButton(
                label: 'Send',
                icon: Icons.send_rounded,
                semanticLabel: 'Send the question',
                onPressed: busy ? null : _send,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ExchangeView extends StatelessWidget {
  const _ExchangeView({required this.exchange, required this.onRetry});

  final AskExchange exchange;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final answer = exchange.answer;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // The question, right-aligned like a chat bubble.
          Align(
            alignment: Alignment.centerRight,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: s.accentFill,
                  borderRadius: BorderRadius.circular(s.radiusMedium),
                ),
                child: Text(
                  exchange.question,
                  style: s.fonts.body(15, s.accentInk, weight: FontWeight.w600),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (exchange.pending)
            Semantics(
              liveRegion: true,
              label: 'Reading the document to answer',
              excludeSemantics: true,
              child: Row(
                children: [
                  const Led(live: true),
                  const SizedBox(width: 10),
                  Text(
                    'Reading the document…',
                    style: s.fonts.body(14, s.textMuted),
                  ),
                ],
              ),
            )
          else if (exchange.error != null)
            Semantics(
              liveRegion: true,
              child: NpPanel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.warning_amber_rounded, color: s.warn, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          'No answer',
                          style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(exchange.error!, style: s.fonts.body(14, s.textMuted)),
                    const SizedBox(height: 10),
                    NpButton(
                      label: 'Retry',
                      icon: Icons.refresh_rounded,
                      kind: NpButtonKind.ghost,
                      onPressed: onRetry,
                    ),
                  ],
                ),
              ),
            )
          else if (answer != null)
            _AnswerView(answer: answer),
        ],
      ),
    );
  }
}

class _AnswerView extends StatelessWidget {
  const _AnswerView({required this.answer});

  final AskAnswer answer;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final body = s.fonts.body(15.5, s.text, height: 1.5);
    final sheet = MarkdownStyleSheet(
      p: body,
      a: body.copyWith(color: s.accentText, decoration: TextDecoration.underline),
      strong: body.copyWith(fontWeight: FontWeight.w700),
      em: body.copyWith(fontStyle: FontStyle.italic),
      listBullet: body,
      h1: s.fonts.displaySemi(20, s.text),
      h2: s.fonts.displaySemi(18, s.text),
      h3: s.fonts.displaySemi(16, s.text),
      code: s.fonts.mono(14, s.text).copyWith(backgroundColor: s.panelSolid),
      codeblockDecoration: BoxDecoration(
        color: s.panelSolid,
        borderRadius: BorderRadius.circular(s.radiusMedium),
        border: Border.all(color: s.line),
      ),
      blockquote: body.copyWith(color: s.textMuted),
      blockquoteDecoration: BoxDecoration(
        border: Border(left: BorderSide(color: s.accentFill, width: 3)),
      ),
      horizontalRuleDecoration: BoxDecoration(
        border: Border(top: BorderSide(color: s.line)),
      ),
      tableBody: body,
      tableHead: body.copyWith(fontWeight: FontWeight.w700),
      tableBorder: TableBorder.all(color: s.line),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MarkdownBody(
          data: prettifyMathInMarkdown(answer.answer),
          styleSheet: sheet,
          selectable: true,
        ),
        if (answer.mode == 'fallback') ...[
          const SizedBox(height: 8),
          Text(
            'Answered from the document’s raw text (its search index was '
            'unavailable), so there are no exact passages to cite.',
            style: s.fonts.body(13, s.textFaint),
          ),
        ],
        if (answer.citations.isNotEmpty) ...[
          const SizedBox(height: 12),
          NpLabel('Sources · ${answer.citations.length}'),
          const SizedBox(height: 8),
          for (var i = 0; i < answer.citations.length; i++)
            _CitationCard(index: i + 1, citation: answer.citations[i]),
        ],
        if (answer.model != null || answer.provider != null) ...[
          const SizedBox(height: 6),
          Text(
            [answer.provider, answer.model].whereType<String>().join(' · '),
            style: s.fonts.mono(11.5, s.textFaint),
          ),
        ],
      ],
    );
  }
}

class _CitationCard extends StatelessWidget {
  const _CitationCard({required this.index, required this.citation});

  final int index;
  final Citation citation;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final where = citation.page != null ? 'Page ${citation.page}' : 'Source $index';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        container: true,
        label: '$where. ${citation.excerpt}',
        excludeSemantics: true,
        child: NpPanel(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          shadow: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '[$index] $where',
                style: s.fonts.mono(12.5, s.accentText, weight: FontWeight.w700),
              ),
              if (citation.excerpt.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  citation.excerpt,
                  maxLines: 6,
                  overflow: TextOverflow.ellipsis,
                  style: s.fonts.body(14, s.textMuted, height: 1.45),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

final RegExp _mathIsland = RegExp(r'\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$');

/// Answers often contain LaTeX. Until real math typesetting arrives (M2),
/// `$…$` becomes readable unicode, and `$$…$$` gets its own line.
String prettifyMathInMarkdown(String markdown) =>
    markdown.replaceAllMapped(_mathIsland, (m) {
      final display = m.group(1);
      final text = _escapeMarkdown(latexToUnicode(display ?? m.group(2)));
      return display != null ? '\n\n$text\n\n' : text;
    });

/// Leftover `_` and `*` in prettified math must not turn into emphasis.
String _escapeMarkdown(String s) =>
    s.replaceAll(r'\', r'\\').replaceAll('_', r'\_').replaceAll('*', r'\*');

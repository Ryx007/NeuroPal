// Re-export every model so consumers can do:
//   const { User, Document, ChatMessage } = require('./models');

module.exports = {
    User: require('./User'),
    Document: require('./Document'),
    DocumentChunk: require('./DocumentChunk'),
    ReadingSession: require('./ReadingSession'),
    ChatMessage: require('./ChatMessage'),
    CompanionMessage: require('./CompanionMessage'),
    Anchor: require('./Anchor'),
    DailyLog: require('./DailyLog'),
    FrameworkConfig: require('./FrameworkConfig'),
    Resource: require('./Resource'),
    Professional: require('./Professional'),
    SpendingLog: require('./SpendingLog'),
    TtsCache: require('./TtsCache'),
    AuditLog: require('./AuditLog'),
    Annotation: require('./Annotation'),
    SavedSimulation: require('./SavedSimulation'),
    Note: require('./Note'),
};

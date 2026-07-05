// Wraps an async (req, res, next) handler so thrown errors propagate to
// Express's error middleware instead of leaking unhandled rejections.
//
//   router.post('/foo', asyncHandler(async (req, res) => {
//       throw new ApiError(401, 'nope');   // → 401 JSON response
//   }));
module.exports = function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

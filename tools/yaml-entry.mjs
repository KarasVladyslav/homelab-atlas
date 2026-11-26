// Entry for `npm run vendor:yaml`: bundles the `yaml` library into src/vendor/yaml.min.js as a
// global YAML for the browser (the page has no build step).
export { parse, parseDocument, stringify, isMap, isSeq, isScalar, isPair, YAMLMap, YAMLSeq, Scalar, Document } from 'yaml';

// ============================================================
// intellisense.js - Snippets esenciales para todos los lenguajes
// soportados + configuración de diagnósticos para que las
// importaciones relativas no marquen error.
// ============================================================

export function setupIntelliSense(monacoNS) {
  // Desactiva la validación semántica de TS/JS (imports, tipos no
  // resueltos) manteniendo la validación sintáctica.
  monacoNS.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
  monacoNS.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
  monacoNS.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monacoNS.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monacoNS.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monacoNS.languages.typescript.ModuleKind.ESNext,
    allowJs: true,
  });

  registerHtmlSnippets(monacoNS);
  registerJsSnippets(monacoNS);
  registerSimpleSnippets(monacoNS, ['css', 'scss', 'less'], CSS_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['python'], PYTHON_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['json'], JSON_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['markdown'], MARKDOWN_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['shell'], SHELL_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['sql'], SQL_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['php'], PHP_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['java'], JAVA_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['c'], C_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['cpp'], CPP_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['csharp'], CSHARP_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['go'], GO_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['rust'], RUST_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['ruby'], RUBY_SNIPPETS);
  registerSimpleSnippets(monacoNS, ['yaml'], YAML_SNIPPETS);
}

function snippetRange(model, position) {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

// ---------------- Helper genérico para registrar snippets simples ----------------

function registerSimpleSnippets(monacoNS, languages, items) {
  languages.forEach((lang) => {
    monacoNS.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, position) {
        const range = snippetRange(model, position);
        return {
          suggestions: items.map((it) => ({
            label: it.label,
            kind: monacoNS.languages.CompletionItemKind.Snippet,
            documentation: it.doc,
            insertText: it.text,
            insertTextRules: monacoNS.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          })),
        };
      },
    });
  });
}

// ---------------- HTML (con soporte de trigger '!' tipo emmet) ----------------

function registerHtmlSnippets(monacoNS) {
  const html5 = [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '\t<meta charset="UTF-8">',
    '\t<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '\t<title>${1:Documento}</title>',
    '</head>',
    '<body>',
    '\t${2}',
    '</body>',
    '</html>',
  ].join('\n');

  monacoNS.languages.registerCompletionItemProvider('html', {
    triggerCharacters: [':', '!'],
    provideCompletionItems(model, position) {
      const range = snippetRange(model, position);
      return {
        suggestions: [
          {
            label: 'html:5', kind: monacoNS.languages.CompletionItemKind.Snippet,
            documentation: 'Estructura básica HTML5', insertText: html5,
            insertTextRules: monacoNS.languages.CompletionItemInsertTextRule.InsertAsSnippet, range,
          },
          {
            label: '!', kind: monacoNS.languages.CompletionItemKind.Snippet,
            documentation: 'Estructura básica HTML5 (emmet)', insertText: html5,
            insertTextRules: monacoNS.languages.CompletionItemInsertTextRule.InsertAsSnippet, range,
          },
        ],
      };
    },
  });
}

// ---------------- JS / TS ----------------

function registerJsSnippets(monacoNS) {
  ['javascript', 'typescript'].forEach((lang) => {
    monacoNS.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, position) {
        const range = snippetRange(model, position);
        return {
          suggestions: JS_SNIPPETS.map((it) => ({
            label: it.label,
            kind: monacoNS.languages.CompletionItemKind.Snippet,
            documentation: it.doc,
            insertText: it.text,
            insertTextRules: monacoNS.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          })),
        };
      },
    });
  });
}

const JS_SNIPPETS = [
  { label: 'cl', text: 'console.log(${1});', doc: 'console.log()' },
  { label: 'func', text: 'function ${1:nombre}(${2}) {\n\t${3}\n}', doc: 'Función declarada' },
  { label: 'afn', text: 'const ${1:nombre} = (${2}) => {\n\t${3}\n};', doc: 'Función flecha' },
  { label: 'imp', text: "import { ${1} } from './${2:modulo}.js';", doc: 'Import ES Module' },
  { label: 'exp', text: 'export function ${1:nombre}(${2}) {\n\t${3}\n}', doc: 'Export function' },
  { label: 'fetch', text: "fetch('${1:url}')\n\t.then(res => res.json())\n\t.then(data => {\n\t\t${2}\n\t})\n\t.catch(err => console.error(err));", doc: 'Fetch API' },
  { label: 'try', text: 'try {\n\t${1}\n} catch (err) {\n\tconsole.error(err);\n}', doc: 'try/catch' },
  { label: 'foreach', text: '${1:array}.forEach((${2:item}) => {\n\t${3}\n});', doc: 'Array.forEach' },
];

// ---------------- Python ----------------

const PYTHON_SNIPPETS = [
  { label: 'def', text: 'def ${1:nombre}(${2}):\n\t${3:pass}', doc: 'Definir función' },
  { label: 'class', text: 'class ${1:Nombre}:\n\tdef __init__(self, ${2}):\n\t\t${3:pass}', doc: 'Definir clase' },
  { label: 'main', text: 'def main():\n\t${1:pass}\n\n\nif __name__ == "__main__":\n\tmain()', doc: 'Punto de entrada main' },
  { label: 'for', text: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', doc: 'Bucle for' },
  { label: 'ifmain', text: 'if __name__ == "__main__":\n\t${1:pass}', doc: 'Guard __main__' },
];

// ---------------- CSS / SCSS / LESS ----------------

const CSS_SNIPPETS = [
  { label: 'flex', text: 'display: flex;\nalign-items: center;\njustify-content: ${1:center};', doc: 'Flexbox básico' },
  { label: 'grid', text: 'display: grid;\ngrid-template-columns: ${1:repeat(3, 1fr)};\ngap: ${2:16px};', doc: 'Grid básico' },
  { label: 'media', text: '@media (max-width: ${1:768px}) {\n\t${2}\n}', doc: 'Media query' },
  { label: 'anim', text: '@keyframes ${1:nombre} {\n\tfrom { ${2} }\n\tto { ${3} }\n}', doc: 'Keyframes de animación' },
  { label: 'import', text: "@import url('${1:archivo.css}');", doc: 'Importar archivo CSS' },
];

// ---------------- JSON ----------------

const JSON_SNIPPETS = [
  { label: 'pkg', text: '{\n\t"name": "${1:proyecto}",\n\t"version": "1.0.0",\n\t"scripts": {\n\t\t"start": "${2:node index.js}"\n\t}\n}', doc: 'Esqueleto package.json' },
];

// ---------------- Markdown ----------------

const MARKDOWN_SNIPPETS = [
  { label: 'link', text: '[${1:texto}](${2:url})', doc: 'Enlace' },
  { label: 'img', text: '![${1:alt}](${2:url})', doc: 'Imagen' },
  { label: 'code', text: '```${1:js}\n${2}\n```', doc: 'Bloque de código' },
  { label: 'table', text: '| ${1:Col1} | ${2:Col2} |\n| --- | --- |\n| ${3} | ${4} |', doc: 'Tabla' },
];

// ---------------- Shell / Bash ----------------

const SHELL_SNIPPETS = [
  { label: 'shebang', text: '#!/usr/bin/env bash\n\n${1}', doc: 'Shebang de bash' },
  { label: 'iff', text: 'if [ ${1:condicion} ]; then\n\t${2}\nfi', doc: 'Condicional if' },
  { label: 'forloop', text: 'for ${1:item} in ${2:lista}; do\n\t${3}\ndone', doc: 'Bucle for' },
];

// ---------------- SQL ----------------

const SQL_SNIPPETS = [
  { label: 'select', text: 'SELECT ${1:*}\nFROM ${2:tabla}\nWHERE ${3:condicion};', doc: 'SELECT' },
  { label: 'insert', text: 'INSERT INTO ${1:tabla} (${2:columnas})\nVALUES (${3:valores});', doc: 'INSERT' },
  { label: 'update', text: 'UPDATE ${1:tabla}\nSET ${2:columna} = ${3:valor}\nWHERE ${4:condicion};', doc: 'UPDATE' },
  { label: 'create', text: 'CREATE TABLE ${1:tabla} (\n\t${2:id} INT PRIMARY KEY,\n\t${3}\n);', doc: 'CREATE TABLE' },
];

// ---------------- PHP ----------------

const PHP_SNIPPETS = [
  { label: 'phpopen', text: '<?php\n${1}\n?>', doc: 'Etiqueta de apertura PHP' },
  { label: 'func', text: 'function ${1:nombre}(${2}) {\n\t${3}\n}', doc: 'Función' },
  { label: 'class', text: 'class ${1:Nombre} {\n\tpublic function __construct(${2}) {\n\t\t${3}\n\t}\n}', doc: 'Clase' },
];

// ---------------- Java ----------------

const JAVA_SNIPPETS = [
  { label: 'main', text: 'public static void main(String[] args) {\n\t${1}\n}', doc: 'Método main' },
  { label: 'class', text: 'public class ${1:Nombre} {\n\t${2}\n}', doc: 'Clase pública' },
  { label: 'sout', text: 'System.out.println(${1});', doc: 'System.out.println()' },
];

// ---------------- C ----------------

const C_SNIPPETS = [
  { label: 'main', text: '#include <stdio.h>\n\nint main() {\n\t${1}\n\treturn 0;\n}', doc: 'Programa principal' },
  { label: 'for', text: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', doc: 'Bucle for' },
];

// ---------------- C++ ----------------

const CPP_SNIPPETS = [
  { label: 'main', text: '#include <iostream>\nusing namespace std;\n\nint main() {\n\t${1}\n\treturn 0;\n}', doc: 'Programa principal' },
  { label: 'cout', text: 'cout << ${1} << endl;', doc: 'Salida por consola' },
];

// ---------------- C# ----------------

const CSHARP_SNIPPETS = [
  { label: 'main', text: 'class Program {\n\tstatic void Main(string[] args) {\n\t\t${1}\n\t}\n}', doc: 'Programa principal' },
  { label: 'cw', text: 'Console.WriteLine(${1});', doc: 'Console.WriteLine()' },
];

// ---------------- Go ----------------

const GO_SNIPPETS = [
  { label: 'main', text: 'package main\n\nimport "fmt"\n\nfunc main() {\n\t${1}\n}', doc: 'Programa principal' },
  { label: 'func', text: 'func ${1:nombre}(${2}) ${3} {\n\t${4}\n}', doc: 'Función' },
  { label: 'iferr', text: 'if err != nil {\n\t${1:return err}\n}', doc: 'Manejo de error' },
];

// ---------------- Rust ----------------

const RUST_SNIPPETS = [
  { label: 'main', text: 'fn main() {\n\t${1}\n}', doc: 'Función main' },
  { label: 'fn', text: 'fn ${1:nombre}(${2}) -> ${3:()} {\n\t${4}\n}', doc: 'Función' },
  { label: 'println', text: 'println!("${1}");', doc: 'Imprimir en consola' },
];

// ---------------- Ruby ----------------

const RUBY_SNIPPETS = [
  { label: 'def', text: 'def ${1:nombre}(${2})\n\t${3}\nend', doc: 'Definir método' },
  { label: 'class', text: 'class ${1:Nombre}\n\tdef initialize(${2})\n\t\t${3}\n\tend\nend', doc: 'Definir clase' },
  { label: 'each', text: '${1:array}.each do |${2:item}|\n\t${3}\nend', doc: 'Iterar con each' },
];

// ---------------- YAML ----------------

const YAML_SNIPPETS = [
  { label: 'service', text: '${1:servicio}:\n  image: ${2:imagen}\n  ports:\n    - "${3:8080}:${4:80}"', doc: 'Servicio docker-compose' },
];

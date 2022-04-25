import ts from "typescript";
import { builders as b, namedTypes as n } from "ast-types";
import K from "ast-types/gen/kinds";
import { map, some } from "./util";

const headerComment = ` ${"@"}flow
 * ${"@"}generated by TsFlow
 `;

export function convertSourceFile(node: ts.SourceFile): n.File {
  return b.file(
    b.program.from({
      comments: [b.commentBlock(headerComment)],
      body: node.statements.map(convertStatement),
    }),
    node.fileName
  );
}

function convertStatement(node: ts.Statement): K.StatementKind {
  try {
    const inner = convertStatementExceptExport(node);

    if (
      some(node.modifiers, (mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (!n.Declaration.check(inner)) {
        if (n.EmptyStatement.check(inner)) {
          // Presumably an error or unimplemented.  Nothing further to log.
          return inner;
        }

        console.error(
          `warning: statement has "export", but conversion not a declaration`
        );
        // TODO better log this; note in output
        return inner;
      }

      return b.exportNamedDeclaration(inner as K.DeclarationKind);
    }

    return inner;
  } catch (err) {
    console.error(err);
    return errorStatement(node, `internal error: ${(err as Error).message}`);
  }
}

function convertStatementExceptExport(node: ts.Statement): K.StatementKind {
  switch (node.kind) {
    case ts.SyntaxKind.VariableStatement:
      return convertVariableStatement(node as ts.VariableStatement);

    case ts.SyntaxKind.Block:
    case ts.SyntaxKind.EmptyStatement:
    case ts.SyntaxKind.ExpressionStatement:
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.ContinueStatement:
    case ts.SyntaxKind.BreakStatement:
    case ts.SyntaxKind.ReturnStatement:
    case ts.SyntaxKind.WithStatement:
    case ts.SyntaxKind.SwitchStatement:
    case ts.SyntaxKind.LabeledStatement:
    case ts.SyntaxKind.ThrowStatement:
    case ts.SyntaxKind.TryStatement:
    case ts.SyntaxKind.DebuggerStatement:
    case ts.SyntaxKind.VariableDeclaration:
    case ts.SyntaxKind.VariableDeclarationList:
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.InterfaceDeclaration:
    case ts.SyntaxKind.TypeAliasDeclaration:
    case ts.SyntaxKind.EnumDeclaration:
    case ts.SyntaxKind.ModuleDeclaration:
    case ts.SyntaxKind.ModuleBlock:
    case ts.SyntaxKind.CaseBlock:
    case ts.SyntaxKind.NamespaceExportDeclaration:
    case ts.SyntaxKind.ImportEqualsDeclaration:
    case ts.SyntaxKind.ImportDeclaration:
    case ts.SyntaxKind.ImportClause:
    case ts.SyntaxKind.NamespaceImport:
    case ts.SyntaxKind.NamedImports:
    case ts.SyntaxKind.ImportSpecifier:
    case ts.SyntaxKind.ExportAssignment:
    case ts.SyntaxKind.ExportDeclaration:
    case ts.SyntaxKind.NamedExports:
    case ts.SyntaxKind.NamespaceExport:
    case ts.SyntaxKind.ExportSpecifier:
    case ts.SyntaxKind.MissingDeclaration:
      return unimplementedStatement(node);

    default:
      return errorStatement(
        node,
        `unexpected statement kind: ${ts.SyntaxKind[node.kind]}`
      );
  }
}

function convertVariableStatement(node: ts.VariableStatement): K.StatementKind {
  return b.variableDeclaration(
    "var", // TODO
    map(node.declarationList.declarations, (node) => {
      return b.variableDeclarator(
        b.identifier.from({
          name: (node.name /* TODO */ as ts.Identifier).text,
          typeAnnotation: node.type && b.typeAnnotation(convertType(node.type)),
        })
      );
    })
  );
}

function convertType(node: ts.TypeNode): K.FlowTypeKind {
  switch (node.kind) {
    case ts.SyntaxKind.TypeReference:
      return convertTypeReference(node as ts.TypeReferenceNode);

    case ts.SyntaxKind.TypePredicate:
    case ts.SyntaxKind.FunctionType:
    case ts.SyntaxKind.ConstructorType:
    case ts.SyntaxKind.TypeQuery:
    case ts.SyntaxKind.TypeLiteral:
    case ts.SyntaxKind.ArrayType:
    case ts.SyntaxKind.TupleType:
    case ts.SyntaxKind.OptionalType:
    case ts.SyntaxKind.RestType:
    case ts.SyntaxKind.UnionType:
    case ts.SyntaxKind.IntersectionType:
    case ts.SyntaxKind.ConditionalType:
    case ts.SyntaxKind.InferType:
    case ts.SyntaxKind.ParenthesizedType:
    case ts.SyntaxKind.ThisType:
    case ts.SyntaxKind.TypeOperator:
    case ts.SyntaxKind.IndexedAccessType:
    case ts.SyntaxKind.MappedType:
    case ts.SyntaxKind.LiteralType:
    case ts.SyntaxKind.NamedTupleMember:
    case ts.SyntaxKind.TemplateLiteralType:
    case ts.SyntaxKind.TemplateLiteralTypeSpan:
    case ts.SyntaxKind.ImportType:
      return unimplementedType(node);

    default:
      return errorType(
        node,
        `unexpected type kind: ${ts.SyntaxKind[node.kind]}`
      );
  }
}

function convertTypeReference(node: ts.TypeReferenceNode): K.FlowTypeKind {
  return b.genericTypeAnnotation(
    // TODO: Insert rewrites here.
    convertEntityNameAsType(node.typeName),
    !node.typeArguments
      ? null
      : b.typeParameterInstantiation(node.typeArguments.map(convertType))
  );
}

function convertEntityNameAsType(
  node: ts.EntityName
): K.IdentifierKind | K.QualifiedTypeIdentifierKind {
  return ts.isIdentifier(node)
    ? b.identifier(node.text)
    : b.qualifiedTypeIdentifier(
        convertEntityNameAsType(node.left),
        b.identifier(node.right.text)
      );
}

function unimplementedStatement(node: ts.Statement): K.StatementKind {
  const msg = ` tsflow-unimplemented: ${ts.SyntaxKind[node.kind]} `;
  return b.emptyStatement.from({
    comments: [b.commentBlock(msg, true, false), quotedStatement(node)],
  });
}

function errorStatement(
  node: ts.Statement,
  description: string
): K.StatementKind {
  const msg = ` tsflow-error: ${description} `;
  return b.emptyStatement.from({
    comments: [b.commentBlock(msg, true, false), quotedStatement(node)],
  });
}

function unimplementedType(node: ts.TypeNode): K.FlowTypeKind {
  const msg = ` tsflow-unimplemented: ${ts.SyntaxKind[node.kind]} `;
  return b.genericTypeAnnotation.from({
    id: b.identifier("$FlowFixMe"),
    typeParameters: null,
    comments: [quotedInlineNode(node), b.commentBlock(msg, false, true)],
  });
}

function errorType(node: ts.TypeNode, description: string): K.FlowTypeKind {
  const msg = ` tsflow-error: ${description} `;
  return b.genericTypeAnnotation.from({
    id: b.identifier("$FlowFixMe"),
    typeParameters: null,
    comments: [quotedInlineNode(node), b.commentBlock(msg, false, true)],
  });
}

function quotedStatement(node: ts.Statement): K.CommentKind {
  const sourceFile = node.getSourceFile();
  const text = sourceFile.text.slice(node.pos, node.end);
  return b.commentBlock(` ${text} `, false, true);
}

function quotedInlineNode(node: ts.Node): K.CommentKind {
  const sourceFile = node.getSourceFile();
  const text = sourceFile.text.slice(node.pos, node.end);
  return b.commentBlock(` ${text} `, false, true);
}

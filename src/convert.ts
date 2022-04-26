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
    case ts.SyntaxKind.ImportDeclaration:
      return convertImportDeclaration(node as ts.ImportDeclaration);

    case ts.SyntaxKind.ExportAssignment:
      return convertExportAssignment(node as ts.ExportAssignment);

    case ts.SyntaxKind.VariableStatement:
      return convertVariableStatement(node as ts.VariableStatement);

    case ts.SyntaxKind.TypeAliasDeclaration:
      return convertTypeAliasDeclaration(node as ts.TypeAliasDeclaration);

    case ts.SyntaxKind.FunctionDeclaration:
      return convertFunctionDeclaration(node as ts.FunctionDeclaration);

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
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.InterfaceDeclaration:
    case ts.SyntaxKind.EnumDeclaration:
    case ts.SyntaxKind.ModuleDeclaration:
    case ts.SyntaxKind.ModuleBlock:
    case ts.SyntaxKind.CaseBlock:
    case ts.SyntaxKind.NamespaceExportDeclaration:
    case ts.SyntaxKind.ImportEqualsDeclaration:
    case ts.SyntaxKind.ImportClause:
    case ts.SyntaxKind.NamespaceImport:
    case ts.SyntaxKind.NamedImports:
    case ts.SyntaxKind.ImportSpecifier:
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

function convertImportDeclaration(node: ts.ImportDeclaration): K.StatementKind {
  const { importClause } = node;
  if (!importClause) throw new Error("unimplemented: no import clause");

  const specifiers: (
    | n.ImportSpecifier
    | n.ImportNamespaceSpecifier
    | n.ImportDefaultSpecifier
  )[] = [];

  if (importClause.name)
    specifiers.push(
      b.importDefaultSpecifier(convertIdentifier(importClause.name))
    );

  const { namedBindings } = importClause;
  if (namedBindings) {
    if (ts.isNamedImports(namedBindings)) {
      for (const binding of namedBindings.elements) {
        specifiers.push(
          b.importSpecifier(
            convertIdentifier(binding.propertyName ?? binding.name),
            convertIdentifier(binding.name)
          )
        );
      }
    } else {
      specifiers.push(
        b.importNamespaceSpecifier(convertIdentifier(namedBindings.name))
      );
    }
  }

  const source = b.stringLiteral(
    // JSDoc on ImportDeclaration#moduleSpecifier says:
    //   > If this is not a StringLiteral it will be a grammar error.
    (node.moduleSpecifier as ts.StringLiteral).text
  );

  return b.importDeclaration(specifiers, source);
}

function convertExportAssignment(node: ts.ExportAssignment): K.StatementKind {
  if (node.isExportEquals)
    // TODO(error): make this a proper "unimplemented"
    return errorStatement(node, 'unimplemented: "export ="');

  if (!ts.isIdentifier(node.expression))
    // TODO(runtime): These don't appear in .d.ts files, but do in TS.
    return errorStatement(node, `"export default" with non-identifier`);

  return b.exportDefaultDeclaration(convertIdentifier(node.expression));
}

function convertVariableStatement(node: ts.VariableStatement): K.StatementKind {
  const flags =
    node.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let);
  return b.variableDeclaration(
    flags === ts.NodeFlags.Const
      ? "var" // TODO(runtime): For .js.flow files, we always declare `var`, not `const`.
      : flags === ts.NodeFlags.Let
      ? "let"
      : "var",
    map(node.declarationList.declarations, (node) => {
      return b.variableDeclarator(
        convertIdentifier(
          node.name /* TODO */ as ts.Identifier,
          node.type && convertType(node.type)
        )
      );
    })
  );
}

function convertTypeAliasDeclaration(
  node: ts.TypeAliasDeclaration
): K.StatementKind {
  return b.typeAlias(
    convertIdentifier(node.name),
    !node.typeParameters
      ? null
      : b.typeParameterDeclaration(
          node.typeParameters.map((param) =>
            b.typeParameter(
              param.name.text,
              null,
              // TODO per param.constraint jsdoc: Consider calling `getEffectiveConstraintOfTypeParameter`
              !param.constraint
                ? null
                : b.typeAnnotation(convertType(param.constraint))
            )
          )
        ),
    convertType(node.type)
  );
}

function convertFunctionDeclaration(node: ts.FunctionDeclaration) {
  if (!node.name) throw 0; // TODO(error)

  return b.declareFunction(
    convertIdentifier(node.name, convertFunctionType(node))
  );
}

function convertType(node: ts.TypeNode): K.FlowTypeKind {
  switch (node.kind) {
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.VoidKeyword:
      return b.voidTypeAnnotation();
    case ts.SyntaxKind.BooleanKeyword:
      return b.booleanTypeAnnotation();
    case ts.SyntaxKind.NumberKeyword:
      return b.numberTypeAnnotation();
    case ts.SyntaxKind.StringKeyword:
      return b.stringTypeAnnotation();

    case ts.SyntaxKind.LiteralType:
      return convertLiteralType(node as ts.LiteralTypeNode);

    case ts.SyntaxKind.TypeReference:
      return convertTypeReference(node as ts.TypeReferenceNode);

    case ts.SyntaxKind.UnionType:
      return convertUnionType(node as ts.UnionTypeNode);

    case ts.SyntaxKind.ArrayType:
      return b.arrayTypeAnnotation(
        convertType((node as ts.ArrayTypeNode).elementType)
      );

    case ts.SyntaxKind.TupleType:
      return b.tupleTypeAnnotation(
        (node as ts.TupleTypeNode).elements.map(convertType)
      );

    case ts.SyntaxKind.FunctionType:
      return convertFunctionType(node as ts.FunctionTypeNode);

    case ts.SyntaxKind.TypeLiteral:
      return convertTypeLiteral(node as ts.TypeLiteralNode);

    case ts.SyntaxKind.TypePredicate:
    case ts.SyntaxKind.ConstructorType:
    case ts.SyntaxKind.TypeQuery:
    case ts.SyntaxKind.OptionalType:
    case ts.SyntaxKind.RestType:
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

function convertLiteralType(node: ts.LiteralTypeNode): K.FlowTypeKind {
  switch (node.literal.kind) {
    case ts.SyntaxKind.NullKeyword:
      return b.nullTypeAnnotation();
    case ts.SyntaxKind.FalseKeyword:
      return b.booleanLiteralTypeAnnotation(false, "false");
    case ts.SyntaxKind.TrueKeyword:
      return b.booleanLiteralTypeAnnotation(true, "true");

    case ts.SyntaxKind.PrefixUnaryExpression: {
      const literal = node.literal as ts.PrefixUnaryExpression;
      if (
        literal.operator !== ts.SyntaxKind.MinusToken ||
        !ts.isNumericLiteral(literal.operand)
      )
        throw 0; // TODO(error)
      const { text } = literal.operand;
      // TODO: is more conversion needed on these number literals?
      return b.numberLiteralTypeAnnotation(-Number(text), text);
    }

    case ts.SyntaxKind.NumericLiteral: {
      const { text } = node.literal;
      // TODO: is more conversion needed on these number literals?
      return b.numberLiteralTypeAnnotation(Number(text), text);
    }

    case ts.SyntaxKind.StringLiteral: {
      const { text } = node.literal;
      // TODO: is more conversion needed on these string literals?
      return b.stringLiteralTypeAnnotation(text, text);
    }

    case ts.SyntaxKind.BigIntLiteral: // TODO is this possible?
    default:
      return errorType(
        node,
        `unexpected literal-type kind: ${ts.SyntaxKind[node.literal.kind]}`
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
    ? convertIdentifier(node)
    : b.qualifiedTypeIdentifier(
        convertEntityNameAsType(node.left),
        convertIdentifier(node.right)
      );
}

function convertUnionType(node: ts.UnionTypeNode): K.FlowTypeKind {
  return b.unionTypeAnnotation(node.types.map(convertType));
}

function convertFunctionType(
  node: ts.FunctionTypeNode | ts.FunctionDeclaration
): K.FlowTypeKind {
  const typeParams = null; // TODO

  const params: n.FunctionTypeParam[] = [];
  let restParam = null;
  for (let i = 0; i < node.parameters.length; i++) {
    const param = node.parameters[i];

    const name = convertIdentifier(param.name /* TODO */ as ts.Identifier);

    if (param.dotDotDotToken) {
      // This is a rest parameter, so (if valid TS) must be the last one.
      restParam = b.functionTypeParam(
        name,
        // TS function parameter types must have names, but can lack types.
        // When missing, for a rest param the type is implicitly `any[]`.
        param.type
          ? convertType(param.type)
          : b.arrayTypeAnnotation(b.anyTypeAnnotation()),
        false
      );
      break;
    }

    params.push(
      b.functionTypeParam(
        name,
        // TS function parameter types must have names, but can lack types.
        // When missing, the type is implicitly `any`.
        param.type ? convertType(param.type) : b.anyTypeAnnotation(),
        !!param.questionToken
      )
    );
  }

  // TS function types always have explicit return types, but
  // FunctionDeclaration may not.  Implicitly that means `any`.
  const resultType = node.type ? convertType(node.type) : b.anyTypeAnnotation();

  return b.functionTypeAnnotation(params, resultType, restParam, typeParams);
}

function convertTypeLiteral(node: ts.TypeLiteralNode): K.FlowTypeKind {
  const properties: (n.ObjectTypeProperty | n.ObjectTypeSpreadProperty)[] = [];
  for (let i = 0; i < node.members.length; i++) {
    const member = node.members[i];
    switch (member.kind) {
      case ts.SyntaxKind.PropertySignature: {
        const { name, questionToken, type } = member as ts.PropertySignature;
        properties.push(
          b.objectTypeProperty(
            convertIdentifier(name /* TODO */ as ts.Identifier),
            type ? convertType(type) : b.anyTypeAnnotation(),
            !!questionToken
          )
        );
        break;
      }

      case ts.SyntaxKind.CallSignature:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.IndexSignature:
        throw new Error(
          `unimplemented TypeElement kind: ${ts.SyntaxKind[member.kind]}`
        );

      default:
        throw 0; // TODO(error)
    }
  }

  //   const indexers = undefined; // TODO
  //   const callProperties = undefined; // TODO
  const exact = true; // TODO

  return b.objectTypeAnnotation.from({
    properties,
    exact,
    inexact: !exact,
  });
}

function convertIdentifier(
  node: ts.Identifier,
  type?: K.FlowTypeKind
): K.IdentifierKind {
  // TODO(rename): audit this function's callers
  return !type
    ? b.identifier(node.text)
    : b.identifier.from({
        name: node.text,
        typeAnnotation: b.typeAnnotation(type),
      });
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

{-# LANGUAGE OverloadedStrings, ScopedTypeVariables #-}

module C64jasmSyntax (
    syntaxHilightHtml
) where

import Prelude hiding (takeWhile)
import Control.Applicative
import Data.Char (isAlphaNum)
import Data.List (elem)
import Data.Attoparsec.Text
import qualified Data.Text as T

data Token =
    Label T.Text
  | Ws Int
  | Keyword T.Text
  | LineComment T.Text
  | Pseudo T.Text
  | OtherChar T.Text
  | Ident T.Text
  | Number T.Text
  | String T.Text
  deriving (Show)

lexer :: Parser [Token]
lexer = lineWithLabel <|> lineWithoutLabel

lineWithLabel = do
  lbl <- label
  rest <- lineWithoutLabel
  return (lbl:rest)

lineWithoutLabel = do
  many (lineComment <|> ws <|> pseudo <|> (Ident <$> ident) <|> stringLiteral <|> num <|> otherChar)

lineComment = do
  char ';'
  s <- takeText
  endOfInput
  return (LineComment s)

label = do
  s <- ident
  char ':'
  return (Label s)

pseudo = do
  char '!'
  s <- ident
  return (Pseudo s)

ident = do
  first <- char '_' <|> letter
  rest <- takeWhile (\c -> isAlphaNum c || c == '_')
  return (T.cons first rest)

stringLiteral = do
  char '"'
  x <- takeWhile (\c -> c /= '"')
  char '"'
  return . String $ x


ws = do
  c <- takeWhile1 (\c -> c == ' ')
  return . Ws . T.length $ c

otherChar = do
  c <- T.singleton <$> satisfy (\c -> inClass "+,#<>{}()=.-" c) <|> (string "::")
  return . OtherChar $ c

num = num2 <|> num16 <|> num10

num2 = do
  char '%'
  n <- takeWhile1 (inClass "01")
  return . Number $ (T.cons '%' n)

num16 = do
  char '$'
  n <- takeWhile1 (inClass "abcdef0123456789")
  return . Number $ (T.cons '$' n)

num10 = do
  n <- many1 digit
  return . Number . T.pack $ n

code :: [String] -> [String]
code lines = ["<pre class='asm-block'>"] ++ lines ++ ["</pre>"]

-- ; Clear the screen RAM (all 1024 bytes)
-- clear_screen: {
--     lda #$20
--     ldx #0
-- loop:
--     sta $0400, x
--     sta $0400 + $100, x
--     sta $0400 + $200, x
--     sta $0400 + $300, x
--     inx
--     bne loop
--     rts
-- }

isMnemonic :: T.Text -> Bool
isMnemonic s = s `elem` ["adc", "and", "asl", "bcc", "bcs", "beq", "bit", "bmi", "bne", "bpl", "brk", "bvc", "bvs", "clc", "cld", "cli", "clv", "cmp", "cpx", "cpy", "dec", "dex", "dey", "eor", "inc", "inx", "iny", "jmp", "jsr", "lda", "ldx", "ldy", "lsr", "nop", "ora", "pha", "php", "pla", "plp", "rol", "ror", "rti", "rts", "sbc", "sec", "sed", "sei", "sta", "stx", "sty", "tax", "tay", "tsx", "txa", "txs", "tya"]

hspan :: T.Text -> T.Text -> T.Text
hspan className text = T.concat ["<span class='", className, "'>", text, "</span>"]

htmlize :: Either String [Token] -> T.Text
htmlize (Right tokens) =
  T.concat (map toHtml tokens)
  where
    toHtml (Ws n) = T.replicate n " "
    toHtml (Label lbl) = hspan "asm-label" (T.concat [lbl, ":"])
    toHtml (OtherChar c) = hspan "asm-other" c
    toHtml (Number n) = hspan "asm-num" n
    toHtml (Ident n) = hspan (if isMnemonic n then "asm-mnemonic" else "asm-ident") n
    toHtml (LineComment c) = hspan "asm-comment" (T.concat [";", c])
    toHtml (Pseudo c) = hspan "asm-pseudo" (T.concat ["!", c])
    toHtml (String c) = hspan "asm-string" (T.concat ["\"", c, "\""])
    toHtml x = T.pack . show $ x
htmlize (Left err) = T.pack err

syntaxHilightHtml :: String -> String
syntaxHilightHtml text =
    unlines . code . map (T.unpack . convertLine . T.pack) . lines $ text
    where
        convertLine :: T.Text -> T.Text
        convertLine s = htmlize (parseOnly lexer s)

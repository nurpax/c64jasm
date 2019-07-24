{-# LANGUAGE OverloadedStrings, ScopedTypeVariables #-}

--import Control.Monad.IO.Class (liftIO)
import Control.Concurrent (threadDelay)
import Control.Monad (forever)
import Text.Pandoc
import Text.Pandoc.Walk (walk)
import System.Directory (createDirectoryIfMissing, copyFile)
import System.FSNotify (withManager, watchTree)
import System.Environment (getArgs)

import qualified Data.Text as T
import qualified Data.Text.IO as T

import qualified C64jasmSyntax as C64

processCodeSamples :: Block -> Block
processCodeSamples (CodeBlock (_,a,_) s) =
    transform a s
    where
        transform ["c64"] s =  Para [RawInline "html" (C64.syntaxHilightHtml s)]
        transform a s = CodeBlock ([],[],[]) s

processCodeSamples x = x

-- Argh!  When saving a file, VSCode truncates the
-- saved file to zero length.  The build watcher reacts
-- to that event right away and rebuilds with pandoc.
-- But at that point the file is zero length.  So add
-- a delay to the file notification before building.
delay c m = do
    threadDelay c
    v <- m
    return v

pandocBuild :: IO ()
pandocBuild = do
    inlineCss <- T.readFile "docs/style.css"
    f <- T.readFile "docs/index.md"
    mdTemplate <- readFile "docs/templates/default.html"
    result <- runIO $ do
        doc <- readMarkdown def {
            readerExtensions = enableExtension Ext_yaml_metadata_block githubMarkdownExtensions
        } f
        writeHtml5String
            def {
                writerTemplate   = Just mdTemplate
              , writerExtensions = pandocExtensions
              , writerTableOfContents = True
              , writerVariables = [("inline-css", T.unpack inlineCss)]
            }
            (walk processCodeSamples doc)
    text <- handleError result
    createDirectoryIfMissing False "build"
    createDirectoryIfMissing False "build/img"
    copyFile "img/sprites.gif" "build/img/sprites.gif"
    T.writeFile "build/index.html" text
    putStrLn "Build results written to build/"

watchAndRebuild :: String -> IO ()
watchAndRebuild dir = do
    putStrLn ("Watching directory " ++ dir ++ " for changes..")
    pandocBuild
    withManager $ \mgr -> do
        -- start a watching job (in the background)
        watchTree
          mgr
          dir
          (const True) -- predicate
          (\e -> delay 50 pandocBuild)  -- action

        -- sleep forever (until interrupted)
        forever $ threadDelay 1000000

main :: IO ()
main = do
    args <- getArgs
    case args of
      ["watch"] -> watchAndRebuild "docs"
      ["build"] -> pandocBuild

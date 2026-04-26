'use client';
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Chess, Square } from 'chess.js';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false });

interface Props {
  fen: string;
  orientation?: 'white' | 'black';
  playerSide?: 'white' | 'black';
  onMove?: (from: Square, to: Square, promotion?: string) => boolean;
  lastMove?: { from: Square; to: Square } | null;
  disabled?: boolean;
  showCoordinates?: boolean;
}

export function Board({ fen, orientation = 'white', playerSide = 'white', onMove, lastMove, disabled = false, showCoordinates = true }: Props) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [premove, setPremove] = useState<{ from: Square; to: Square } | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});
  const chess = new Chess(fen);

  // Last move highlight
  const lastMoveStyles: Record<string, any> = lastMove
    ? {
        [lastMove.from]: { backgroundColor: 'rgba(212, 168, 67, 0.25)' },
        [lastMove.to]:   { backgroundColor: 'rgba(212, 168, 67, 0.35)' },
      }
    : {};

  // Selected square + legal moves
  const getMoveOptions = useCallback((square: Square) => {
    const moves = chess.moves({ square, verbose: true });
    if (!moves.length) return {};
    const styles: Record<string, any> = {};
    styles[square] = { backgroundColor: 'rgba(212, 168, 67, 0.4)' };
    for (const m of moves) {
      styles[m.to] = chess.get(m.to)
        ? { background: 'radial-gradient(circle, rgba(212,168,67,.6) 60%, rgba(212,168,67,.3) 100%)', borderRadius: '50%' }
        : { background: 'radial-gradient(circle, rgba(212,168,67,.5) 25%, transparent 27%)', borderRadius: '50%' };
    }
    return styles;
  }, [fen]);

  const onSquareClick = useCallback((square: Square) => {
    if (disabled) return;
    const isMyTurn = (chess.turn() === 'w' && playerSide === 'white') || (chess.turn() === 'b' && playerSide === 'black');

    // Premove when not our turn
    if (!isMyTurn) {
      if (premove?.from === square) { setPremove(null); return; }
      if (selectedSquare) { setPremove({ from: selectedSquare, to: square }); setSelectedSquare(null); setOptionSquares({}); return; }
      setSelectedSquare(square); return;
    }

    // Select piece
    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece || (piece.color === 'w') !== (playerSide === 'white')) return;
      setSelectedSquare(square);
      setOptionSquares(getMoveOptions(square));
      return;
    }

    // Deselect if same square
    if (selectedSquare === square) { setSelectedSquare(null); setOptionSquares({}); return; }

    // Try move
    const piece = chess.get(selectedSquare);
    const isPromotion = piece?.type === 'p' && ((playerSide === 'white' && square[1] === '8') || (playerSide === 'black' && square[1] === '1'));
    const success = onMove?.(selectedSquare, square, isPromotion ? 'q' : undefined);

    if (success) {
      // Apply premove if any
      if (premove) { setTimeout(() => onMove?.(premove.from, premove.to), 100); setPremove(null); }
    } else {
      // Try selecting new piece
      const newPiece = chess.get(square);
      if (newPiece && (newPiece.color === 'w') === (playerSide === 'white')) {
        setSelectedSquare(square);
        setOptionSquares(getMoveOptions(square));
        return;
      }
    }
    setSelectedSquare(null);
    setOptionSquares({});
  }, [selectedSquare, premove, playerSide, fen, disabled, onMove, getMoveOptions]);

  const customSquareStyles = {
    ...lastMoveStyles,
    ...optionSquares,
    ...(premove ? { [premove.from]: { backgroundColor: 'rgba(100, 149, 237, 0.4)' }, [premove.to]: { backgroundColor: 'rgba(100, 149, 237, 0.25)' } } : {}),
  };

  return (
    <div className="board-wrapper select-none">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        onSquareClick={onSquareClick}
        arePiecesDraggable={!disabled}
        onPieceDrop={(from, to) => {
          if (disabled) return false;
          const chess2 = new Chess(fen);
          const piece = chess2.get(from as Square);
          const isPromotion = piece?.type === 'p' && ((playerSide === 'white' && to[1] === '8') || (playerSide === 'black' && to[1] === '1'));
          return onMove?.(from as Square, to as Square, isPromotion ? 'q' : undefined) ?? false;
        }}
        customSquareStyles={customSquareStyles}
        customDarkSquareStyle={{ backgroundColor: '#4a6080' }}
        customLightSquareStyle={{ backgroundColor: '#b0bcce' }}
        showBoardNotation={showCoordinates}
        animationDuration={150}
      />
    </div>
  );
}
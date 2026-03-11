import React, { useState, useEffect, useCallback } from 'react';

// 난이도 설정
const DIFFICULTIES = {
  beginner: { rows: 9, cols: 9, mines: 10, name: '초급' },
  intermediate: { rows: 16, cols: 16, mines: 40, name: '중급' },
  expert: { rows: 16, cols: 30, mines: 99, name: '고급' }
};

// 주변 지뢰 개수에 따른 숫자 색상
const NUMBER_COLORS = {
  1: 'text-blue-600',
  2: 'text-green-600',
  3: 'text-red-600',
  4: 'text-purple-800',
  5: 'text-red-900',
  6: 'text-teal-600',
  7: 'text-black',
  8: 'text-gray-600'
};

export default function App() {
  const [difficulty, setDifficulty] = useState('beginner');
  const [board, setBoard] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle', 'playing', 'won', 'lost'
  const [flagsCount, setFlagsCount] = useState(0);
  const [time, setTime] = useState(0);
  const [firstClick, setFirstClick] = useState(true);
  
  // 모바일/터치 환경을 위한 조작 모드 (파기 vs 깃발 꽂기)
  const [interactionMode, setInteractionMode] = useState('dig'); // 'dig', 'flag'

  // 보드 복사 헬퍼 함수
  const copyBoard = (b) => b.map(row => row.map(cell => ({ ...cell })));

  // 게임 초기화
  const initBoard = useCallback((diffKey) => {
    const { rows, cols } = DIFFICULTIES[diffKey];
    const newBoard = Array(rows).fill(null).map((_, r) =>
      Array(cols).fill(null).map((_, c) => ({
        row: r, col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0,
        exploded: false,
        causedLoss: false
      }))
    );
    setBoard(newBoard);
    setStatus('idle');
    setFlagsCount(0);
    setTime(0);
    setFirstClick(true);
  }, []);

  // 초기 렌더링 및 난이도 변경 시 초기화
  useEffect(() => {
    initBoard(difficulty);
  }, [difficulty, initBoard]);

  // 타이머 로직
  useEffect(() => {
    let timer;
    if (status === 'playing') {
      timer = setInterval(() => {
        setTime(prev => Math.min(prev + 1, 999)); // 최대 999초
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  // 첫 클릭 시 지뢰 배치 및 숫자 계산 (첫 클릭에는 절대 지뢰가 없도록 보장)
  const placeMines = (startRow, startCol, currentBoard) => {
    const { rows, cols, mines } = DIFFICULTIES[difficulty];
    let minesPlaced = 0;

    // 지뢰 배치
    while (minesPlaced < mines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      
      // 첫 클릭 위치이거나 이미 지뢰가 있는 곳은 패스
      if (!currentBoard[r][c].isMine && !(r === startRow && c === startCol)) {
        currentBoard[r][c].isMine = true;
        minesPlaced++;
      }
    }

    // 주변 지뢰 개수 계산
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (!currentBoard[i][j].isMine) {
          let count = 0;
          for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
              const ni = i + di;
              const nj = j + dj;
              if (ni >= 0 && ni < rows && nj >= 0 && nj < cols && currentBoard[ni][nj].isMine) {
                count++;
              }
            }
          }
          currentBoard[i][j].neighborMines = count;
        }
      }
    }
  };

  // 빈 칸(0) 연속 열기 (Flood Fill 알고리즘)
  const revealEmptyCells = (startRow, startCol, b) => {
    const { rows, cols } = DIFFICULTIES[difficulty];
    const stack = [[startRow, startCol]];

    while (stack.length > 0) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;

      const cell = b[r][c];
      if (cell.isRevealed || cell.isFlagged || cell.isMine) continue;

      cell.isRevealed = true;

      if (cell.neighborMines === 0) {
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            stack.push([r + di, c + dj]);
          }
        }
      }
    }
  };

  // 승리 조건 체크
  const checkWin = (b) => {
    const { rows, cols, mines } = DIFFICULTIES[difficulty];
    let revealedCount = 0;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (b[r][c].isRevealed) revealedCount++;
      }
    }

    if (revealedCount === (rows * cols) - mines) {
      setStatus('won');
      // 남은 지뢰에 모두 자동으로 깃발 꽂기
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (b[r][c].isMine) {
            b[r][c].isFlagged = true;
          }
        }
      }
      setFlagsCount(mines);
    }
  };

  // 셀 좌클릭 (또는 모바일 파기 모드 클릭)
  const handleLeftClick = (r, c) => {
    if (status === 'won' || status === 'lost') return;
    
    const newBoard = copyBoard(board);
    const cell = newBoard[r][c];

    // 이미 열렸거나 깃발이 꽂힌 경우 무시
    if (cell.isRevealed || cell.isFlagged) return;

    if (firstClick) {
      placeMines(r, c, newBoard);
      setFirstClick(false);
      setStatus('playing');
    }

    // 지뢰를 클릭한 경우
    if (newBoard[r][c].isMine) {
      cell.causedLoss = true;
      // 모든 지뢰 공개
      const { rows, cols } = DIFFICULTIES[difficulty];
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (newBoard[i][j].isMine && !newBoard[i][j].isFlagged) {
            newBoard[i][j].isRevealed = true;
          } else if (!newBoard[i][j].isMine && newBoard[i][j].isFlagged) {
            // 잘못 꽂은 깃발 표시
            newBoard[i][j].exploded = true; 
          }
        }
      }
      setBoard(newBoard);
      setStatus('lost');
      return;
    }

    // 빈 칸 열기
    revealEmptyCells(r, c, newBoard);
    setBoard(newBoard);
    checkWin(newBoard);
  };

  // 셀 우클릭 (또는 모바일 깃발 모드 클릭)
  const handleRightClick = (e, r, c) => {
    if (e) e.preventDefault();
    if (status === 'won' || status === 'lost') return;

    const newBoard = copyBoard(board);
    const cell = newBoard[r][c];

    if (cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    setFlagsCount(prev => cell.isFlagged ? prev + 1 : prev - 1);
    setBoard(newBoard);
  };

  // 통합 클릭 핸들러 (현재 모드에 따라 분기)
  const handleCellClick = (e, r, c) => {
    if (interactionMode === 'flag') {
      handleRightClick(null, r, c);
    } else {
      handleLeftClick(r, c);
    }
  };

  // 상태에 따른 스마일리 아이콘
  const getSmiley = () => {
    if (status === 'won') return '😎';
    if (status === 'lost') return '😵';
    return '😐';
  };

  // 숫자 포맷팅 (000 형태)
  const formatNumber = (num) => {
    const parsed = Math.max(-99, Math.min(999, num)); // -99 ~ 999 제한
    const isNegative = parsed < 0;
    const absStr = Math.abs(parsed).toString().padStart(isNegative ? 2 : 3, '0');
    return isNegative ? `-${absStr}` : absStr;
  };

  const minesLeft = DIFFICULTIES[difficulty].mines - flagsCount;

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4 font-sans text-neutral-800">
      
      {/* 헤더 및 설정 영역 */}
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-white mb-4">지뢰찾기</h1>
        <div className="flex gap-2 justify-center">
          {Object.entries(DIFFICULTIES).map(([key, data]) => (
            <button
              key={key}
              onClick={() => setDifficulty(key)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                difficulty === key 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {data.name}
            </button>
          ))}
        </div>
      </div>

      {/* 게임 보드 컨테이너 */}
      <div className="bg-neutral-300 p-4 rounded-xl shadow-2xl border-4 border-neutral-400 select-none">
        
        {/* 상단 전광판 (지뢰 개수, 리셋, 시간) */}
        <div className="flex justify-between items-center bg-neutral-800 p-3 rounded-lg border-4 border-neutral-700 mb-4 border-t-neutral-900 border-l-neutral-900">
          <div className="text-red-500 font-mono text-3xl tracking-widest bg-black px-2 py-1 rounded shadow-inner">
            {formatNumber(minesLeft)}
          </div>
          <button 
            onClick={() => initBoard(difficulty)}
            className="text-4xl hover:scale-110 active:scale-95 transition-transform drop-shadow-md bg-neutral-300 border-4 border-t-white border-l-white border-b-neutral-500 border-r-neutral-500 rounded p-1"
          >
            {getSmiley()}
          </button>
          <div className="text-red-500 font-mono text-3xl tracking-widest bg-black px-2 py-1 rounded shadow-inner">
            {formatNumber(time)}
          </div>
        </div>

        {/* 그리드 */}
        <div className="overflow-x-auto max-w-[90vw] lg:max-w-none">
          <div 
            className="grid gap-[1px] bg-neutral-500 border-2 border-neutral-600 p-[1px]"
            style={{ gridTemplateColumns: `repeat(${DIFFICULTIES[difficulty].cols}, minmax(0, 1fr))` }}
            onContextMenu={(e) => e.preventDefault()} // 게임보드 전체 우클릭 방지
          >
            {board.map((row, r) => 
              row.map((cell, c) => {
                
                // 셀 스타일 결정
                let cellClass = "w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xl font-bold ";
                
                if (!cell.isRevealed) {
                  // 안 열린 상태 (입체감 있는 버튼)
                  cellClass += "bg-neutral-300 border-[3px] border-t-white border-l-white border-b-neutral-500 border-r-neutral-500 hover:bg-neutral-200 cursor-pointer";
                } else {
                  // 열린 상태 (평평하게)
                  if (cell.causedLoss) {
                    cellClass += "bg-red-500 border-[1px] border-neutral-400"; // 클릭해서 터진 지뢰
                  } else {
                    cellClass += "bg-neutral-200 border-[1px] border-neutral-400";
                  }
                }

                return (
                  <div
                    key={`${r}-${c}`}
                    className={cellClass}
                    onClick={(e) => handleCellClick(e, r, c)}
                    onContextMenu={(e) => handleRightClick(e, r, c)}
                  >
                    {cell.isRevealed ? (
                      cell.isMine ? '💣' : 
                      cell.exploded ? '❌' : // 잘못 꽂은 깃발
                      cell.neighborMines > 0 ? (
                        <span className={NUMBER_COLORS[cell.neighborMines] || 'text-black'}>
                          {cell.neighborMines}
                        </span>
                      ) : ''
                    ) : (
                      cell.isFlagged ? '🚩' : ''
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 모바일 조작 모드 토글 (화면이 작을 때 특히 유용함) */}
      <div className="mt-8 flex gap-4 bg-neutral-800 p-2 rounded-full border border-neutral-700">
        <button 
          onClick={() => setInteractionMode('dig')}
          className={`px-6 py-2 rounded-full font-bold transition-colors ${
            interactionMode === 'dig' ? 'bg-blue-500 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
          }`}
        >
          ⛏️ 파기
        </button>
        <button 
          onClick={() => setInteractionMode('flag')}
          className={`px-6 py-2 rounded-full font-bold transition-colors ${
            interactionMode === 'flag' ? 'bg-red-500 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
          }`}
        >
          🚩 깃발
        </button>
      </div>

      {/* 게임 종료 안내 */}
      {(status === 'won' || status === 'lost') && (
        <div className={`mt-6 text-2xl font-black ${status === 'won' ? 'text-green-400' : 'text-red-500'} animate-bounce`}>
          {status === 'won' ? '🎉 승리했습니다! 🎉' : '💥 지뢰를 밟았습니다! 💥'}
        </div>
      )}

    </div>
  );
}